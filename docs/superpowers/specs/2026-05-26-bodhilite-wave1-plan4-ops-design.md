# BodhiLite — Wave 1 Plan 4 (Ops) Design

**Date:** 2026-05-26
**Author:** A. Elangovan + Claude (brainstorming session)
**Status:** Draft — awaiting user sign-off before plan-writing
**Parent spec:** [`2026-05-16-bodhilite-phase1-design.md`](2026-05-16-bodhilite-phase1-design.md) (locked)
**Predecessor plans:**

- [`2026-05-16-bodhilite-wave1-foundation.md`](../plans/2026-05-16-bodhilite-wave1-foundation.md) (Plan 1 — merged `eb9e319`)
- [`2026-05-18-bodhilite-wave1-plan2-authoring.md`](../plans/2026-05-18-bodhilite-wave1-plan2-authoring.md) (Plan 2 — merged `694e5c3`)
- [`2026-05-26-bodhilite-wave1-plan3-attempt-grading.md`](../plans/2026-05-26-bodhilite-wave1-plan3-attempt-grading.md) (Plan 3 — merged `c932c1f`)

---

## 0. Scope of this document

Plan 4 is the **Ops** slice of Wave 1 — the last plan before the cohort opens on **Jul 6, 2026**. It builds the operational floor that lets BodhiLite legitimately host real student data:

- **CSV gradebook export** in Canvas-import-compatible format, instructor-downloadable from the per-assessment gradebook page.
- **Daily encrypted pg_dump backup pipeline** via GitHub Actions → `age`-encrypted in CI → Backblaze B2 (30-day retention).
- **Sentry server + client** error monitoring with strict PII scrubbing (no emails, no answer bodies, no raw user IDs).
- **Pre-launch restore drill** (the spec §9 hard gate): full restore of yesterday's dump into a fresh Supabase project, smoke SQL verification, audit_log entry, tear down. Reusable quarterly.

Plan 4 does **not** build Supabase Storage / instructor image uploads, Cloudflare R2 as a media CDN, load testing, cost dashboards, or an on-call rotation — those are deferred to a post-launch Plan 5 (no commitment yet). It does not change any DB schema. It does not change any existing route or component beyond adding the CSV download button to Plan 3's gradebook page.

This document describes WHAT Plan 4 delivers and HOW the sub-systems fit together. The implementation plan (task breakdown, ordering, atomic-commit boundaries) will be generated separately by the writing-plans skill from this spec.

### Plan boundary (decided during brainstorming)

- **Plan 4 builds:** CSV export sub-system (pure module + Route Handler + download button), daily backup pipeline (GitHub Actions workflow + age encryption + B2 upload + retention sweep), Sentry sub-system (configs + pure scrub module + canary route), restore-drill runbook + Jul 5 rehearsal.
- **Plan 4 does NOT build:** Supabase Storage / image uploads, R2 as media CDN, load test, cost monitoring, on-call rotation, question weighting, randomization, exam timer, accommodations UI beyond Plan 3's `extra_attempts`, Ketcher/RDKit. These are Plan 5 (post-launch) or Wave 2+.
- **Plan 4 reuses from Plan 3:** the `gradebook_rows` view (already RLS-scoped via `attempts` policies), `requireInstructor()` helper, the `(instructor)` route group's existing per-assessment gradebook page at `app/(instructor)/assessments/[id]/attempts/page.tsx` as the CSV-button mount point. The audit_log table accepts new event types via its existing `action TEXT` column — no schema change required.

---

## 1. Decisions locked during brainstorming

These are the design-shaping decisions made before plan-writing. Each is recorded here so the implementation plan can flow from them without re-litigation.

| #   | Decision                                                                                                                                                                                                                                                                          | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Plan 4 scope = Core-4 ship-blockers only.** CSV export, daily encrypted backups, Sentry, pre-launch restore drill. Storage/images, R2-as-media, load test, cost dashboard, on-call all deferred to a post-launch Plan 5.                                                        | 6 weeks to Jul 6 launch × 5–10 hrs/wk user availability leaves room for Core-4 + content authoring + NVDA + smoke tests + restore drill. Full original Plan 4 scope risks slipping launch. Image uploads can be added in Plan 5 once real authoring usage surfaces what's actually needed.                                                                                                                                                                                      |
| D2  | **Backup target = Backblaze B2** (S3-compatible). Not R2, not Supabase-only, not GHA artifacts.                                                                                                                                                                                   | Free 10 GB + free egress up to 3× stored covers Wave 1 volume (~50 MB/day = 1.5 GB/mo). 5-min account setup. Matches the spec's "second-vendor cold storage" intent. R2 was the spec's original suggestion but its sole advantage (zero egress) doesn't matter at Wave 1 volume; B2 is equivalent and the signup is simpler.                                                                                                                                                    |
| D3  | **Encryption at rest = `age` (X25519) with CI-side encryption.** pg_dump is piped directly into `age` via shell pipe; no plaintext lands on the runner's disk. Private key stored in 1Password + offline paper backup; public key in `AGE_PUBKEY` GH Actions secret.              | If B2 is compromised, B2 holds no readable data. `age` is modern, single-binary, simpler than GPG. Pipe-only flow is defense-in-depth even though GH Actions runners are ephemeral. The private-key offline backup is the catastrophic-loss mitigation; documented in the restore runbook.                                                                                                                                                                                      |
| D4  | **CSV format = Canvas Gradebook Import-compatible.** Columns: `Student`, `SIS User ID`, `SIS Login ID`, `<Assessment Name>`. `SIS Login ID` = `users.email`. `SIS User ID` left blank — Canvas matches via Login ID.                                                              | Pierce Canvas accepts Login ID match against email. Zero-config round-trip: instructor downloads, Canvas imports without column re-mapping. Matches the success-criterion in phase-1 spec line 28 ("re-imported into Canvas in under 5 minutes per assessment").                                                                                                                                                                                                                |
| D5  | **CSV delivery = Route Handler with download button** (not Server Action). `app/api/gradebook/[id]/csv/route.ts` streams `text/csv` with `Content-Disposition: attachment`.                                                                                                       | Server Actions in Next 16 don't stream binary/non-JSON responses cleanly. Route Handler is the right tool for downloads. `requireInstructor()` + RLS-scoped query gates the route. 404 (not 403) on non-owner — don't leak existence.                                                                                                                                                                                                                                           |
| D6  | **Sentry PII scrubbing = strict.** Strip emails, names, request/response bodies, query strings, cookies, auth/cookie/`x-supabase-*` headers. Replace `user.id` with HMAC-12-char hash keyed by `SCRUB_HMAC_KEY`.                                                                  | FERPA-load-bearing. The default Sentry `sendDefaultPii=false` is necessary but not sufficient — answer bodies and emails in `extra` / breadcrumb data must be scrubbed too. Recursive walk catches what fixture-based scrubbing misses. HMAC over plain hash so a rainbow-table attack against known UUIDs needs the server-side key.                                                                                                                                           |
| D7  | **Restore drill depth = full restore-and-query.** Spin up `bodhilite-restore-test-YYYYMMDD` Supabase project, restore the latest B2 dump (decrypt → pg_restore), run smoke SQL counts + one known-row assertion, append `restore_drill` row to production `audit_log`, tear down. | Closest match to phase-1 spec §9 "hard gate before Wave 1 opens." Verifies B2 → decryption → pg_restore → Supabase compatibility end-to-end. Reusable runbook for quarterly re-runs. ~30 min the first time; faster thereafter.                                                                                                                                                                                                                                                 |
| D8  | **Sentry vendor = Sentry** (not Vercel Observability or other vendors).                                                                                                                                                                                                           | Mature error-grouping, mature PII controls (`beforeSend` hook accepts custom scrub), automatic source-map upload via `@sentry/nextjs` Vercel integration. Free tier (5k events/mo + 10k performance traces/mo at `tracesSampleRate: 0.1`) is comfortably enough for Wave 1 cohort.                                                                                                                                                                                              |
| D9  | **Zero schema changes.** No new tables, no new migrations. CSV reads through Plan 3's `gradebook_rows` view; audit_log new event types fit the existing `action TEXT` column with payloads in the existing `after JSONB` column.                                                  | Plan 3 already built `gradebook_rows` RLS-scoped via the underlying `attempts` policies; CSV just reads it. CSV-export, restore-drill, and restore-drill-canary audit entries are new `action` strings — not new columns. Keeps blast radius minimal — no migration to coordinate with the running production DB. Trade-off: no student-name column in `users` (see §2.2), accepted because the CSV's `Student` column is cosmetic and Canvas matches on `SIS Login ID` anyway. |
| D10 | **No-plaintext-on-disk for pg_dump.** Enforced by shell pipe: `pg_dump --format=custom $DB_URL \| age -r $AGE_PUBKEY \| rclone rcat b2:…`.                                                                                                                                        | Defense-in-depth. GH Actions runners are ephemeral and isolated, but a pipe-only flow eliminates the window where an unencrypted dump exists on a filesystem. Costs nothing; trivial to enforce in the workflow.                                                                                                                                                                                                                                                                |

---

## 2. CSV gradebook export sub-system

### 2.1 File layout

```
app/(instructor)/assessments/[id]/attempts/page.tsx        (existing, Plan 3 — gradebook page)
   └─ <DownloadCsvButton assessmentId={id} assessmentTitle={title} />   (NEW — Client Component)
         └─ fetch('/api/gradebook/[id]/csv') → blob → trigger download

app/api/gradebook/[id]/csv/route.ts                        (NEW — Route Handler)
   └─ requireInstructor()                                  (existing lib/auth/require.ts)
   └─ SELECT id, title FROM assessments WHERE id = $1     (RLS scopes to owner; non-owner gets 0 rows → 404)
   └─ SELECT student_email, best_pct FROM gradebook_rows WHERE assessment_id = $1
   └─ buildCanvasCsv({ assessmentTitle, rows })            (NEW — pure)
   └─ Response(csvString, { headers: { ... } })
   └─ INSERT INTO audit_log (actor_user_id, action, target_kind, target_id, after)
         VALUES ($caller, 'csv_export', 'assessment', $1, jsonb_build_object('row_count', $n))

lib/export/csv.ts                                          (NEW — pure module)
lib/export/csv.test.ts                                     (NEW — vitest)

components/instructor/DownloadCsvButton.tsx                (NEW — Client Component)
components/instructor/DownloadCsvButton.test.tsx           (NEW — vitest + RTL)

tests/e2e/csv-export.spec.ts                               (NEW — Playwright)
tests/rls/csv-export-rls.spec.ts                           (NEW — Playwright)
tests/a11y/gradebook-csv-button.spec.ts                    (NEW — axe-core)
```

### 2.2 Pure module contract (`lib/export/csv.ts`)

```ts
export type CsvRow = {
  /** Pierce email — used as Canvas SIS Login ID AND as the displayed `Student` column. */
  email: string;
  /** null = not submitted yet (empty cell). number = best percentage in [0, 100], rendered fixed-2-decimal. */
  score: number | null;
};

export function buildCanvasCsv(args: { assessmentTitle: string; rows: CsvRow[] }): string;
```

**Why no student-name field:** `public.users` (migration `0001`) carries only `id, email, role, created_at` — no `full_name`. BodhiLite is magic-link only and never captures a name at sign-in. The CSV uses `email` for both the `Student` column (cosmetic; Canvas requires the column to be non-empty but doesn't match on it) and the `SIS Login ID` column (the actual match key). If a future plan adds names to `users`, the CsvRow type extends additively.

**Semantics:**

- Header row: `Student,SIS User ID,SIS Login ID,<assessmentTitle>\n` — assessment title RFC-4180-quoted if it contains `,`, `"`, or `\n`.
- Each data row: `<email>,,<email>,<scoreStr>\n` — `email` repeats in column 1 (Student) and column 3 (SIS Login ID); empty cell for `SIS User ID`; quoting applied if `email` happens to contain special chars (unusual but RFC-correct); `scoreStr` = `score.toFixed(2)` or empty.
- RFC 4180 quoting: any field containing `,` `"` `\n` is wrapped in double quotes; embedded `"` doubled (`""`).
- Trailing newline after the last row.
- Empty `rows` → header-only output (single line + `\n`).

### 2.3 Route Handler contract (`app/api/gradebook/[id]/csv/route.ts`)

```ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response>;
```

**Behavior:**

| Condition                                               | Status           | Body          |
| ------------------------------------------------------- | ---------------- | ------------- |
| Not signed in                                           | 302 → `/sign-in` | (redirect)    |
| Signed in, not an instructor                            | 403              | `'Forbidden'` |
| Signed in instructor, assessment not found OR not owned | 404              | `'Not found'` |
| Signed in instructor, owned assessment                  | 200              | CSV body      |

**Success response headers:**

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="<slug>-<YYYY-MM-DD>.csv"
Cache-Control: no-store
```

- `<slug>` = `assessmentTitle` lowercased, non-alphanumerics replaced with `-`, collapsed runs, trimmed.
- `<YYYY-MM-DD>` = export date in UTC.

**Audit log row** on success: `INSERT INTO audit_log (actor_user_id, action, target_kind, target_id, after) VALUES ($callerId, 'csv_export', 'assessment', $assessmentId, jsonb_build_object('row_count', $n))`. Failure to write the audit row does NOT fail the export (best-effort; logged via Sentry if available).

### 2.4 Client Component contract (`components/instructor/DownloadCsvButton.tsx`)

```tsx
export function DownloadCsvButton({
  assessmentId,
  assessmentTitle,
}: {
  assessmentId: string;
  assessmentTitle: string;
}): JSX.Element;
```

Behavior:

- Renders a `<Button>` labeled "Download CSV" with download icon.
- On click: disable button + show inline spinner; `fetch('/api/gradebook/[id]/csv')`.
- On 200: read response as blob, create object URL, programmatically click a hidden `<a>` with `download="<filename>"` to trigger save, revoke object URL. Re-enable button.
- On non-200: toast error via `sonner`. Re-enable button.
- On the second rapid click while in-flight: no-op (button disabled).

Accessibility: `aria-label="Download gradebook CSV for <assessmentTitle>"`; focus ring; spinner has `aria-live="polite"` status text "Preparing download…".

### 2.5 Mount point on the gradebook page

The existing Plan 3 gradebook page (`app/(instructor)/assessments/[id]/attempts/page.tsx`) gets one new child: `<DownloadCsvButton assessmentId={id} assessmentTitle={assessment.title} />`, placed in the page header next to the existing breadcrumb/title. No other change to the page beyond this single import + element.

---

## 3. Backup pipeline sub-system

### 3.1 File layout

```
.github/workflows/backup-daily.yml         (NEW)
scripts/backup-retention-guard.sh          (NEW — sourced by the workflow)
scripts/backup-retention-guard.test.sh     (NEW — bats or shell-test)
docs/runbooks/restore-from-b2.md           (NEW — operator-facing decrypt+restore steps)
```

No app code changes. No new dependencies in `package.json`.

### 3.2 Workflow shape (`.github/workflows/backup-daily.yml`)

```yaml
name: Daily backup
on:
  schedule:
    - cron: '0 9 * * *' # 09:00 UTC = 02:00 PT
  workflow_dispatch: # manual trigger for testing

concurrency:
  group: backup-daily
  cancel-in-progress: false # never cancel a backup mid-flight

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - name: Install age + rclone
        run: |
          sudo apt-get install -y age rclone
      - name: Configure rclone for B2
        env:
          B2_ACCOUNT_ID: ${{ secrets.B2_ACCOUNT_ID }}
          B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}
        run: |
          mkdir -p ~/.config/rclone
          cat > ~/.config/rclone/rclone.conf <<EOF
          [b2]
          type = b2
          account = ${B2_ACCOUNT_ID}
          key = ${B2_APPLICATION_KEY}
          EOF
      - name: Dump + encrypt + upload (pipe-only)
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
          AGE_PUBKEY: ${{ secrets.AGE_PUBKEY }}
          B2_BUCKET: ${{ secrets.B2_BUCKET }}
        run: |
          set -euo pipefail
          ts="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
          pg_dump --format=custom "$SUPABASE_DB_URL" \
            | age -r "$AGE_PUBKEY" \
            | rclone rcat "b2:${B2_BUCKET}/${ts}/dump.pgc.age"
      - name: Retention sweep (guarded)
        env:
          B2_BUCKET: ${{ secrets.B2_BUCKET }}
        run: bash scripts/backup-retention-guard.sh
```

**Notes:**

- `pg_dump --format=custom` produces a compressed custom-format dump (~ best fit for `pg_restore`).
- `rclone rcat` reads stdin and writes directly to a B2 object — no temp file.
- `set -euo pipefail` — any step in the pipe failing kills the workflow.
- No retry-with-backoff at the workflow level; GH Actions has its own retry-on-runner-failure. Soft failures (network blip mid-upload) are caught the next day.

### 3.3 Retention guard (`scripts/backup-retention-guard.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Refuse to delete unless a backup from the last 24h exists.
recent=$(rclone lsf "b2:${B2_BUCKET}/" --max-age 24h | wc -l)
if [ "$recent" -lt 1 ]; then
  echo "ERROR: no backup uploaded in last 24h; refusing to sweep" >&2
  exit 1
fi

# Delete objects older than 30 days.
rclone delete "b2:${B2_BUCKET}/" --min-age 30d
```

The guard's "refuse without recent backup" check is unit-testable (mock `rclone` to return 0 lines → assert exit 1; return 1+ lines → assert exit 0).

### 3.4 Secrets required in the GitHub repo

| Secret               | Value                                                                | Where used          |
| -------------------- | -------------------------------------------------------------------- | ------------------- |
| `SUPABASE_DB_URL`    | `postgresql://postgres:<pwd>@db.<project>.supabase.co:5432/postgres` | `pg_dump` step      |
| `AGE_PUBKEY`         | `age1…` (public key, NOT private)                                    | `age -r` encryption |
| `B2_ACCOUNT_ID`      | from B2 bucket "Application Keys"                                    | rclone config       |
| `B2_APPLICATION_KEY` | from B2 bucket "Application Keys"                                    | rclone config       |
| `B2_BUCKET`          | e.g. `bodhilite-backups-prod`                                        | both steps          |

The matching `age` **private key** is NOT a GitHub secret. It lives in:

1. The instructor's 1Password personal vault (primary).
2. A printed paper copy in a physical safe (offline disaster recovery).

Documented in `docs/runbooks/restore-from-b2.md`.

### 3.5 Object layout in B2

```
b2:bodhilite-backups-prod/
  2026-07-06T09-00-12Z/
    dump.pgc.age
  2026-07-07T09-00-09Z/
    dump.pgc.age
  ...
```

Timestamp prefix (not just date) so two same-day runs (cron + manual `workflow_dispatch`) coexist. Retention sweep operates on object age, not directory naming.

### 3.6 B2 bucket configuration (one-time setup, documented in runbook)

- Bucket name: `bodhilite-backups-prod` (sole owner: instructor's B2 account).
- Lifecycle: B2's "Keep prior versions for N days" set to 0 — we manage retention via rclone, not B2 versions.
- Object lock: enabled, 30 days, "compliance" mode — prevents accidental delete-via-API for 30 days even if the application key is compromised.
- Application key permissions: write + read + delete on this bucket only. Not the master key.

---

## 4. Sentry sub-system

### 4.1 File layout

```
sentry.server.config.ts                    (NEW — RSC / Server Actions / Route Handlers)
sentry.client.config.ts                    (NEW — browser)
sentry.edge.config.ts                      (NEW — middleware; minimal)
instrumentation.ts                         (NEW — Next 16 instrumentation entry point)
lib/observability/scrub.ts                 (NEW — shared pure module)
lib/observability/scrub.test.ts            (NEW — vitest fixture catalog + property test)

app/api/__sentry-canary/route.ts           (NEW — instructor-gated PII-canary; removed before launch)

next.config.ts                             (MODIFIED — wrap with withSentryConfig)
.env.example                               (MODIFIED — add SENTRY_DSN, SCRUB_HMAC_KEY, optional CANARY_FLAG)
package.json                               (MODIFIED — add @sentry/nextjs)
```

### 4.2 Pure scrub module (`lib/observability/scrub.ts`)

```ts
import type { Event, EventHint } from '@sentry/nextjs';

export type ScrubOptions = {
  hmacKey: string;
};

/** Apply strict PII scrubbing to a Sentry event in-place-equivalent. Pure: same input + key → same output. */
export function scrubSentryEvent(event: Event, opts: ScrubOptions): Event;
```

**Scrub rules (locked):**

| Source field                                                                                            | Behavior                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event.request.data` (POST body)                                                                        | Replace with the literal string `'[scrubbed]'`                                                                                                             |
| `event.request.query_string`                                                                            | Replace with `'[scrubbed]'`                                                                                                                                |
| `event.request.cookies`                                                                                 | Delete (`undefined`)                                                                                                                                       |
| `event.request.headers[k]` where `k.toLowerCase()` matches `/^(authorization\|cookie\|x-supabase-.*)$/` | Replace value with `'[scrubbed]'`; key preserved (so we still know it was present)                                                                         |
| `event.user.email` / `event.user.username` / `event.user.ip_address`                                    | Delete                                                                                                                                                     |
| `event.user.id` (when present)                                                                          | Replace with `hmac_sha256(value, hmacKey).slice(0, 12)`                                                                                                    |
| `event.extra`                                                                                           | Recursively walk; any string value matching email regex (`/[^\s@]+@[^\s@]+\.[^\s@]+/`) → `'[scrubbed-email]'`; objects and arrays recursed; cycles handled |
| `event.contexts`                                                                                        | Same recursive walk as `event.extra`                                                                                                                       |
| `event.breadcrumbs[].data.body` / `.data.requestBody` / `.data.responseBody`                            | Replace with `'[scrubbed]'`                                                                                                                                |
| `event.breadcrumbs[].data` (other keys)                                                                 | Recursive email scrub                                                                                                                                      |
| `event.message`, `event.exception`                                                                      | NOT scrubbed (stack traces + error messages need to be readable; the email regex DOES still run over message strings as a safety net)                      |

**Error path:** if `scrubSentryEvent` itself throws (e.g., malformed event), the `beforeSend` wrapper catches and returns `null` (drops the event). Dropped event is safer than a leaked one. The drop is `console.error`'d locally so it's visible during development.

### 4.3 Config files

All three Sentry config files share the same `beforeSend` wiring:

```ts
// sentry.server.config.ts (and analogous for client/edge)
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  beforeSend(event) {
    try {
      return scrubSentryEvent(event, {
        hmacKey: process.env.SCRUB_HMAC_KEY ?? '',
      });
    } catch (err) {
      console.error('Sentry scrub failed; dropping event', err);
      return null;
    }
  },
});
```

- `SCRUB_HMAC_KEY` must be set in production (Vercel env vars). Missing → `hmacKey: ''` → HMAC still computed but trivially reversible; surfaced as a startup warning in `instrumentation.ts`.
- `sendDefaultPii: false` is Sentry's built-in scrub (cookies, IPs, most headers) — defense-in-depth alongside our `scrubSentryEvent`.

### 4.4 Source maps

`@sentry/nextjs`'s Vercel integration handles source-map upload automatically on build. No manual config needed beyond setting `SENTRY_AUTH_TOKEN` in Vercel.

### 4.5 Canary route (`app/api/__sentry-canary/route.ts`)

Instructor-only, behind `CANARY_FLAG=on`. Throws a hand-crafted error with deliberately PII-stuffed payload (fake email in URL, fake email in body, fake "studentName" in extras). Used once pre-launch to verify in the Sentry dashboard that the captured event has no PII.

```ts
export async function POST(): Promise<Response> {
  if (process.env.CANARY_FLAG !== 'on') return new Response('Not found', { status: 404 });
  // requireInstructor() etc.
  throw new Error(
    'Sentry canary; if you see this in production logs unscrubbed, the scrub is broken',
  );
}
```

Removed (file deleted, env var unset) before Jul 6 launch. Tracked as a discrete plan task.

### 4.6 Vercel integration vs manual install

Use Sentry's Vercel Marketplace integration (1-click). It auto-populates `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, and `SENTRY_ORG`/`SENTRY_PROJECT` env vars across all environments. The implementation plan documents the install steps.

---

## 5. Restore drill sub-system

Not code — a runbook plus a one-time pre-launch rehearsal.

### 5.1 File layout

```
docs/runbooks/restore-drill.md       (NEW — operator-facing 8-step procedure)
docs/runbooks/restore-from-b2.md     (NEW — sub-procedure: decrypt + pg_restore)
```

The two runbooks compose: `restore-drill.md` orchestrates a full rehearsal; `restore-from-b2.md` is the lower-level "decrypt this B2 object and restore it into a Postgres URL" recipe that the drill calls into. The lower-level runbook is also what gets used in a real incident.

### 5.2 Restore-drill runbook outline

1. **Pre-flight:** confirm `age` private key is in 1Password; confirm B2 application key has read access; confirm at least one backup ≤ 24h old exists in the bucket.
2. **Create temp Supabase project** named `bodhilite-restore-test-YYYYMMDD` via Supabase dashboard. Note the project's DB connection string.
3. **Run the lower-level runbook** (`restore-from-b2.md`): download latest object, decrypt with `age`, `pg_restore` into the temp project.
4. **Smoke SQL** (paste into the temp project's SQL editor):
   ```sql
   SELECT 'users' AS table, count(*) FROM users
   UNION ALL SELECT 'assessments', count(*) FROM assessments
   UNION ALL SELECT 'attempts',    count(*) FROM attempts
   UNION ALL SELECT 'answers',     count(*) FROM answers
   UNION ALL SELECT 'audit_log',   count(*) FROM audit_log;
   ```
   Compare counts against an expected baseline (a fresh seed row in the prod DB the operator inserted before the drill).
5. **Known-row assertion:** before starting, the operator inserts a marker row into prod `audit_log` — `INSERT INTO audit_log (actor_user_id, action, target_kind, target_id, after) VALUES ($operator, 'restore_drill_canary', 'system', NULL, jsonb_build_object('canary_id', gen_random_uuid()))` — and records the generated uuid. After restore, SELECT for that uuid via `after->>'canary_id'` in the temp project; assert exactly 1 row.
6. **Append `restore_drill` row to PRODUCTION `audit_log`** — `INSERT INTO audit_log (actor_user_id, action, target_kind, target_id, after) VALUES ($operator, 'restore_drill', 'system', NULL, jsonb_build_object('drill_id', …, 'completed_at', …, 'restored_dump_path', …, 'ok', true))`. (Production, not the temp project — the drill's evidence lives in the production audit log.)
7. **Tear down** the temp Supabase project.
8. **Document any deviation** from the runbook as a runbook bug; fix the runbook inline and commit.

### 5.3 Pre-launch rehearsal schedule

- **First dry-run on staging:** by Jul 3, run the full drill end-to-end with the goal of finding runbook bugs. Time each step. Fix the runbook.
- **Jul 5 final rehearsal:** run the drill against the real production B2 backup, with the audit_log marker pattern, and the production `restore_drill` row. This is the hard gate per phase-1 spec §9.
- **Quarterly thereafter:** scheduled by calendar reminder; re-run the drill from the runbook.

### 5.4 RTO target and failure modes

Spec §9 target RTO: < 30 min. First-run target: < 60 min (runbook unfamiliarity). Quarterly re-runs should hit < 30 min consistently. If a rehearsal misses RTO, document as a finding but **don't block Wave 1 launch** — Wave 1 is a pilot, not a production SLA.

If three consecutive backups are unrestorable, escalate before launch — pause Wave 1 until the pipeline is fixed.

---

## 6. Testing strategy

| Layer                        | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit (vitest)**            | `lib/export/csv.test.ts` — table-driven: header exactness (header row uses `assessmentTitle` verbatim, with RFC-4180 quoting when the title contains `,` `"` `\n`), score formatting (`null` → empty, `0` → `0.00`, `87.5` → `87.50`, `100` → `100.00`), email duplication in Student + SIS Login ID columns, RFC-4180 quoting on emails that contain `,` `"` `\n` (rare but tested), empty rows → header-only output, trailing newline present. ~20 cases. `lib/observability/scrub.test.ts` — fixture catalog (bare error, form body, auth header, email in query string, email in `extra` depth-3, breadcrumb body, user.id hash determinism, key-dependence, malformed event no-throw) + one property test generating random events and asserting no email-regex match survives. ~15 cases. **Target: 100% line + branch on both pure modules.** |
| **Component (vitest + RTL)** | `DownloadCsvButton.test.tsx` — happy path (fetch 200 → click → download triggered), error toast on 500, disabled state during in-flight, accessible label.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Integration (vitest)**     | Route Handler `app/api/gradebook/[id]/csv/route.test.ts` with mocked Supabase: 200 happy, 401 anonymous, 403 student, 404 non-owner instructor, empty assessment → header-only CSV, audit log write best-effort (assert successful path writes; assert failed audit doesn't fail the 200).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **RLS (Playwright)**         | `tests/rls/csv-export-rls.spec.ts` — instructor A cannot CSV-export instructor B's assessment (404 not 403). Student cannot hit the route (`requireInstructor` rejects).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **a11y (axe-core)**          | `tests/a11y/gradebook-csv-button.spec.ts` — gradebook page with download button passes axe. Tab order reaches the button; focus ring visible; `aria-label` present.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **E2E (Playwright)**         | `tests/e2e/csv-export.spec.ts` — instructor signs in, opens gradebook for a seeded assessment with N students of varying score states (graded, ungraded, null), clicks Download, captures the downloaded file via Playwright's download event, parses CSV, asserts row count + header columns + a known student's score row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Shell test**               | `scripts/backup-retention-guard.test.sh` — using `bats` or a minimal shell test runner: mock `rclone` to return 0 / 1+ lines, assert exit code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Manual canary**            | Sentry canary route fired once locally + once on Vercel preview; manual verification in Sentry dashboard that no PII appears in the captured event. Documented as a pre-launch checklist item, not a CI test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **NVDA runbook**             | Append "Plan 4 — CSV download button" section to `docs/runbooks/nvda-test-script.md`. ~3 steps: navigate to gradebook, hear "Download gradebook CSV" button, activate, hear download confirmation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Backup workflow**          | NOT covered by CI tests. Validated by: (a) local `act` rehearsal during implementation, (b) production rehearsal — first scheduled cron run, manually checked the next morning, (c) the restore drill which is the end-to-end test of "did backups actually work."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Restore drill**            | The runbook IS the test of the restore drill itself. Pre-Jul-3 dry run + Jul 5 production rehearsal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Tests-to-write estimate: ~40 vitest unit tests + 1 component test + 5 integration tests + 1 RLS spec + 1 a11y spec + 1 E2E spec + 1 shell test. Smaller test footprint than Plan 3 (which was ~50 vitest + 4 RLS + 3 axe + 4 E2E) because Plan 4 has less app surface — the two new pure modules are heavily tested but everything else is config files, runbooks, and a shell script.

Aggregate `npm test` must remain GREEN at Plan 4 PR merge. Baseline at Plan 3 merge: 174/174 vitest.

### What we are explicitly NOT testing

- That `pg_dump` produces correct output (Postgres team's job).
- That `age` encrypts correctly (filippo.io's job).
- That B2 stores objects (Backblaze's job).
- That Sentry's SDK uploads events (Sentry's job).
- That Canvas accepts our CSV format — this is verified by the **Jul 3 dry run** in which the instructor runs a real CSV through Canvas's import UI. No automated test.

---

## 7. Carried risks and out-of-scope

### Risks Plan 4 carries

1. **`age` private key loss is catastrophic.** If both the 1Password copy and the paper copy are lost, all encrypted backups become unreadable. Mitigation: documented in runbook; yearly rotation (re-encrypt all backups to a new keypair) is a future ops task; 1Password's own backup is the primary mitigation.
2. **B2 free-tier limits.** 10 GB storage, 3× free egress relative to stored bytes, 2,500 free Class B / 25,000 free Class C transactions per day. Wave 1 volume is ~50 MB/day × 30 days = 1.5 GB — comfortably within free tier. If usage grows (post-launch), B2 pricing kicks in at $0.006/GB-month.
3. **Sentry free-tier limits.** 5k events/mo + 10k performance traces/mo at `tracesSampleRate: 0.1`. Wave 1 cohort is ~30 students; even a runtime-error cascade would have to fire >150 errors/student to exhaust. Real risk only if there's a regression that fires the same error per page load.
4. **GitHub Action runner ephemeral, but not zero-trust.** A compromised GH organization could in principle exfiltrate `SUPABASE_DB_URL` and `B2_APPLICATION_KEY` from the workflow. Mitigation: B2 application key is bucket-scoped and read/write-only (not master); Supabase DB password rotation is documented for any suspected compromise.
5. **Pierce email = Canvas Login ID assumption.** Plan 4 §2.2 / D4 assumes the CSV's `SIS Login ID` column (= `users.email`) matches Canvas's Login ID. **Verify with one test import during the Jul 3 dry run.** If Pierce uses a different convention (e.g., `firstname.lastname@piercecollege.edu` vs `student-id@piercecollege.edu`), the CSV format needs an adjustment.
6. **Sentry source maps may not upload if `SENTRY_AUTH_TOKEN` isn't set in Vercel** — production stack traces become unreadable. Mitigation: verified by the canary route during the pre-launch check.
7. **Restore drill RTO may miss the 30-min target on first try.** Plan-4 §5.4 accepts this for the pilot; documented as a known carry, not a launch blocker unless three consecutive backups are unrestorable.
8. **The Pierce IT/admin notification mentioned in spec §12 (line 436) is not a Plan 4 task** — it's a real-world action the instructor takes by Jun 1. Listed here as a carry so it doesn't get lost.

### Explicitly out-of-scope (Plan 5 or later)

- **Supabase Storage / instructor image uploads** → Plan 5 (post-launch). Wave 1 question content will be authored as KaTeX + markdown text; images added in Plan 5.
- **Cloudflare R2 as media CDN** → Plan 5 if Supabase Storage egress becomes a cost issue.
- **Load test against staging** → Plan 5 polish.
- **Cost monitoring dashboard** (Supabase + Vercel + B2 + Sentry) → Plan 5 polish.
- **On-call rotation / paging integration** → Plan 5 polish; for Wave 1 the instructor IS the on-call.
- **Sentry release tracking + custom dashboards** → Plan 5 polish.
- **Quarterly restore drills automation** → manual via calendar reminder for now.
- **PITR (Supabase managed point-in-time recovery)** is already enabled at the Supabase project level; no Plan 4 task. Documented as the first-line recovery; B2 is the second-line cold storage.
- **Encryption key rotation procedure** → documented in the runbook as a future need; first rotation no sooner than 2027.
- **Backup integrity verification beyond the restore drill** (e.g., periodic checksum verification of B2 objects) → polish; the restore drill catches catastrophic corruption.
- **Audit-log retention / archival** → not Plan 4. Audit log grows indefinitely in the production DB until a Plan 5+ archival task lands.
- **Question weighting / pagination on the gradebook table** → carried from Plan 3.

---

_End of Plan 4 design spec._
