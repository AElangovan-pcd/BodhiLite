# BodhiLite Wave 1 Plan 4 — Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Core-4 operational floor that lets BodhiLite legitimately host real student data on Jul 6, 2026 — Canvas-import-compatible CSV gradebook export, daily encrypted pg_dump backups to Backblaze B2, Sentry error monitoring with strict PII scrubbing, and a pre-launch restore-drill rehearsal that satisfies the phase-1 spec §9 hard gate.

**Architecture:** Four independent sub-systems sharing nothing but the existing Plan 3 `gradebook_rows` view, `requireInstructor()` auth helper, and `audit_log` table. CSV is a Route Handler that builds an RFC-4180 string from a pure module and streams it as `text/csv`. Backups are a single GitHub Actions workflow piping `pg_dump | age | rclone` so no plaintext touches disk. Sentry is configured via three Next.js config files all delegating to one pure scrub module that aggressively strips PII before upload. Restore drill is a markdown runbook plus a pre-launch rehearsal that produces an `audit_log` evidence row. Zero schema changes — `audit_log` accepts new `action` values via its existing `TEXT` column.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict-plus, Tailwind v4, shadcn (radix-nova), Supabase Postgres + Auth + RLS, `@sentry/nextjs` 8.x, `age` (X25519 encryption), `rclone` (B2 transport), Backblaze B2 (S3-compatible cold storage), GitHub Actions cron, Vitest + Playwright + axe-core for tests.

**Parent spec:** [`../specs/2026-05-26-bodhilite-wave1-plan4-ops-design.md`](../specs/2026-05-26-bodhilite-wave1-plan4-ops-design.md)

**Predecessor plans:**

- [`2026-05-16-bodhilite-wave1-foundation.md`](2026-05-16-bodhilite-wave1-foundation.md) (Plan 1 — merged `eb9e319`)
- [`2026-05-18-bodhilite-wave1-plan2-authoring.md`](2026-05-18-bodhilite-wave1-plan2-authoring.md) (Plan 2 — merged `694e5c3`)
- [`2026-05-26-bodhilite-wave1-plan3-attempt-grading.md`](2026-05-26-bodhilite-wave1-plan3-attempt-grading.md) (Plan 3 — merged `c932c1f`)

---

## File map

Files this plan creates or touches:

```
package.json                                              ☆ modify (add @sentry/nextjs)

lib/
  export/
    csv.ts                                                ★ new
    csv.test.ts                                           ★ new
  observability/
    scrub.ts                                              ★ new
    scrub.test.ts                                         ★ new

app/
  api/
    gradebook/
      [id]/
        csv/
          route.ts                                        ★ new
          route.test.ts                                   ★ new
    __sentry-canary/
      route.ts                                            ★ new
  (instructor)/
    assessments/
      [id]/
        attempts/
          page.tsx                                        ☆ modify (mount DownloadCsvButton)

components/
  instructor/
    DownloadCsvButton.tsx                                 ★ new
    DownloadCsvButton.test.tsx                            ★ new

sentry.server.config.ts                                   ★ new
sentry.client.config.ts                                   ★ new
sentry.edge.config.ts                                     ★ new
instrumentation.ts                                        ★ new
next.config.ts                                            ☆ modify (wrap with withSentryConfig)
.env.example                                              ☆ modify (add SENTRY_DSN, SCRUB_HMAC_KEY, etc.)

scripts/
  backup-retention-guard.sh                               ★ new
  backup-retention-guard.test.sh                          ★ new

.github/
  workflows/
    backup-daily.yml                                      ★ new

docs/
  runbooks/
    restore-from-b2.md                                    ★ new
    restore-drill.md                                      ★ new
    nvda-test-script.md                                   ☆ modify (Plan 4 section)

tests/
  e2e/
    csv-export.spec.ts                                    ★ new
  rls/
    csv-export-rls.spec.ts                                ★ new
  a11y/
    gradebook-csv-button.spec.ts                          ★ new
```

★ = new file, ☆ = modify existing.

**No new migrations.** No new tables, no new columns, no new RLS policies. CSV reads through the existing `gradebook_rows` view; new `audit_log` action values (`csv_export`, `restore_drill`, `restore_drill_canary`) fit the existing `action TEXT` column.

---

## Recurring-bug audit (read before executing any task)

Per `~/.claude/projects/.../memory/plan-implementation-bug-patterns.md`, these bugs ship with every plan's code if not caught:

- **`createServerSupabaseClient()` MUST be awaited.** `lib/supabase/server.ts` is async. Plan 4 only adds one Route Handler that uses it (T6), but verify the `await` is present.
- **TypeScript `exactOptionalPropertyTypes`** rejects explicit `undefined` for optional props. If a task needs a conditional prop, use spread `{...(cond ? { foo: x } : {})}`.
- **DB schema reads:** Plan 4 reads `assessments.title`, `users.email`, and `gradebook_rows.{student_email, best_pct}`. These are verified against the live schema in the spec; don't second-guess.
- **`<a href="/...">` to internal route** → use `<Link>`. Only relevant if a task adds an internal link (it doesn't).

---

## Task list (29 tasks)

**Setup** (T1–T2)

1. Create `wave-1-plan4-ops` branch + open draft PR
2. Install `@sentry/nextjs` dependency

**CSV sub-system** (T3–T12) 3. TDD `lib/export/csv.ts` — header row generation (with RFC-4180 quoting on title) 4. TDD `lib/export/csv.ts` — data rows + score formatting 5. TDD `lib/export/csv.ts` — RFC-4180 quoting on emails + empty rows + trailing newline 6. Route Handler `app/api/gradebook/[id]/csv/route.ts` — happy path 7. Route Handler edge cases — 401/403/404 + best-effort audit log 8. `<DownloadCsvButton>` Client Component with download trigger 9. Mount `<DownloadCsvButton>` on gradebook page 10. E2E spec — `tests/e2e/csv-export.spec.ts` 11. RLS spec — `tests/rls/csv-export-rls.spec.ts` 12. a11y spec — `tests/a11y/gradebook-csv-button.spec.ts`

**Backup pipeline** (T13–T18) 13. Create Backblaze B2 account + bucket (manual, documented) 14. Generate age keypair + store private key (manual, documented) 15. Add GitHub Actions secrets 16. Shell test for `scripts/backup-retention-guard.sh` 17. `.github/workflows/backup-daily.yml` 18. `docs/runbooks/restore-from-b2.md` + manual `workflow_dispatch` first-run verification

**Sentry sub-system** (T19–T24) 19. TDD `lib/observability/scrub.ts` — full scrub module 20. Vercel Marketplace Sentry integration + `SCRUB_HMAC_KEY` env var 21. Sentry config files — `sentry.{server,client,edge}.config.ts` + `instrumentation.ts` 22. Wrap `next.config.ts` with `withSentryConfig` 23. Canary route `app/api/__sentry-canary/route.ts` 24. Fire canary on Vercel preview + verify scrub in Sentry dashboard

**Restore drill** (T25–T26) 25. `docs/runbooks/restore-drill.md` 26. Pre-launch dry-run rehearsal (produces `audit_log` evidence row)

**Wrap-up** (T27–T29) 27. Append Plan 4 section to `docs/runbooks/nvda-test-script.md` 28. Full local test run + verify CI green on PR HEAD 29. Plan 4 success-criteria walkthrough + ready-for-review

---

## Task 1: Create branch + open draft PR

**Files:**

- No file changes.

- [ ] **Step 1: Confirm clean working tree on `main`**

Run: `git status && git log --oneline -1`
Expected:

```
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

61fefa5 Add Wave 1 Plan 4 (Ops) design spec
```

- [ ] **Step 2: Create and check out branch**

Run: `git checkout -b wave-1-plan4-ops`

- [ ] **Step 3: Push branch + open draft PR**

Run:

```bash
git push -u origin wave-1-plan4-ops
gh pr create --draft --title "Wave 1 Plan 4: Ops" --body "$(cat <<'EOF'
## Summary

Implements Plan 4 (Ops) — the Core-4 ship-blockers for Jul 6 launch:

- CSV gradebook export (Canvas-import-compatible)
- Daily encrypted pg_dump backups → Backblaze B2
- Sentry server + client with strict PII scrubbing
- Pre-launch restore-drill runbook + rehearsal

Spec: `docs/superpowers/specs/2026-05-26-bodhilite-wave1-plan4-ops-design.md`
Plan: `docs/superpowers/plans/2026-05-26-bodhilite-wave1-plan4-ops.md`

Draft PR; opening early for CI coverage during implementation.

## Test plan

- [ ] `npm test` ≥ 174/174 green
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run format:check` clean
- [ ] `npm run e2e` green (CSV E2E + existing suites)
- [ ] Manual: backup workflow `workflow_dispatch` produces B2 object
- [ ] Manual: Sentry canary captured without PII
- [ ] Manual: restore-drill dry run completes + writes audit_log row
EOF
)"
```

Expected: PR URL printed.

---

## Task 2: Install @sentry/nextjs dependency

**Files:**

- Modify: `package.json` (dependencies)
- Modify: `package-lock.json` (auto-generated)

- [ ] **Step 1: Install dependency**

Run: `npm install @sentry/nextjs@^8`

Expected: package.json gains `"@sentry/nextjs": "^8.x.y"` in dependencies; package-lock.json updates.

- [ ] **Step 2: Verify TypeScript still compiles**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @sentry/nextjs for error monitoring"
git push
```

---

## Task 3: TDD `lib/export/csv.ts` — header row generation

**Files:**

- Create: `lib/export/csv.ts`
- Create: `lib/export/csv.test.ts`

- [ ] **Step 1: Write failing tests for header row**

Create `lib/export/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCanvasCsv } from './csv';

describe('buildCanvasCsv — header row', () => {
  it('writes the four-column Canvas header', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Quiz 1', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Quiz 1\n');
  });

  it('quotes assessment title with a comma', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Quiz, the first', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,"Quiz, the first"\n');
  });

  it('quotes and escapes assessment title with an embedded quote', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Final "Easy" Quiz', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,"Final ""Easy"" Quiz"\n');
  });

  it('quotes assessment title with a newline', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Multi\nLine', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,"Multi\nLine"\n');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run lib/export/csv.test.ts`
Expected: FAIL — `Cannot find module './csv'` or similar.

- [ ] **Step 3: Implement minimal `csv.ts`**

Create `lib/export/csv.ts`:

```ts
export type CsvRow = {
  /** Pierce email — used as both the `Student` column (cosmetic) and the `SIS Login ID` column (Canvas match key). */
  email: string;
  /** null = not submitted yet (empty cell). number = best percentage in [0, 100], rendered as fixed-2-decimal. */
  score: number | null;
};

const NEEDS_QUOTE = /[",\n]/;

function rfc4180(value: string): string {
  if (!NEEDS_QUOTE.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCanvasCsv(args: { assessmentTitle: string; rows: CsvRow[] }): string {
  const { assessmentTitle, rows } = args;
  const header = `Student,SIS User ID,SIS Login ID,${rfc4180(assessmentTitle)}\n`;
  return header;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run lib/export/csv.test.ts`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add lib/export/csv.ts lib/export/csv.test.ts
git commit -m "feat(csv): add buildCanvasCsv header row generation"
git push
```

---

## Task 4: TDD `lib/export/csv.ts` — data rows + score formatting

**Files:**

- Modify: `lib/export/csv.ts`
- Modify: `lib/export/csv.test.ts`

- [ ] **Step 1: Add failing tests for data rows**

Append to `lib/export/csv.test.ts`:

```ts
describe('buildCanvasCsv — data rows', () => {
  it('writes student email in Student + SIS Login ID columns with score formatted to 2 decimals', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Quiz',
      rows: [{ email: 'jdoe@piercecollege.edu', score: 87.5 }],
    });
    expect(csv).toBe(
      'Student,SIS User ID,SIS Login ID,Quiz\n' +
        'jdoe@piercecollege.edu,,jdoe@piercecollege.edu,87.50\n',
    );
  });

  it('writes empty score cell for null', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Quiz',
      rows: [{ email: 'a@b.com', score: null }],
    });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Quiz\n' + 'a@b.com,,a@b.com,\n');
  });

  it('formats 0 as 0.00', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'a@b.com', score: 0 }],
    });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Q\na@b.com,,a@b.com,0.00\n');
  });

  it('formats 100 as 100.00', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'a@b.com', score: 100 }],
    });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Q\na@b.com,,a@b.com,100.00\n');
  });

  it('writes multiple rows in order', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [
        { email: 'a@b.com', score: 87.5 },
        { email: 'c@d.com', score: null },
        { email: 'e@f.com', score: 100 },
      ],
    });
    expect(csv).toBe(
      'Student,SIS User ID,SIS Login ID,Q\n' +
        'a@b.com,,a@b.com,87.50\n' +
        'c@d.com,,c@d.com,\n' +
        'e@f.com,,e@f.com,100.00\n',
    );
  });
});
```

- [ ] **Step 2: Run tests — expect failure on new tests**

Run: `npx vitest run lib/export/csv.test.ts`
Expected: 4 of 9 fail (header tests still pass; new data-row tests fail because rows are not yet rendered).

- [ ] **Step 3: Extend implementation**

Replace `buildCanvasCsv` in `lib/export/csv.ts`:

```ts
export function buildCanvasCsv(args: { assessmentTitle: string; rows: CsvRow[] }): string {
  const { assessmentTitle, rows } = args;
  const header = `Student,SIS User ID,SIS Login ID,${rfc4180(assessmentTitle)}\n`;
  const body = rows
    .map((row) => {
      const email = rfc4180(row.email);
      const scoreStr = row.score === null ? '' : row.score.toFixed(2);
      return `${email},,${email},${scoreStr}\n`;
    })
    .join('');
  return header + body;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run lib/export/csv.test.ts`
Expected: PASS — 9/9.

- [ ] **Step 5: Commit**

```bash
git add lib/export/csv.ts lib/export/csv.test.ts
git commit -m "feat(csv): add data row rendering with score formatting"
git push
```

---

## Task 5: TDD `lib/export/csv.ts` — RFC-4180 on emails + empty rows + trailing newline

**Files:**

- Modify: `lib/export/csv.test.ts`

(No source changes expected — the existing `rfc4180` helper already handles email edge cases. This task adds the tests that prove it.)

- [ ] **Step 1: Add failing tests for edge cases**

Append to `lib/export/csv.test.ts`:

```ts
describe('buildCanvasCsv — edge cases', () => {
  it('quotes email containing a comma (unusual but RFC-correct)', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'odd,address@b.com', score: 50 }],
    });
    expect(csv).toBe(
      'Student,SIS User ID,SIS Login ID,Q\n' + '"odd,address@b.com",,"odd,address@b.com",50.00\n',
    );
  });

  it('quotes email containing a double-quote', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'a"b@c.com', score: 50 }],
    });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Q\n' + '"a""b@c.com",,"a""b@c.com",50.00\n');
  });

  it('returns header-only output when rows is empty', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Q', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Q\n');
    expect(csv.split('\n').filter((line) => line.length > 0)).toHaveLength(1);
  });

  it('ends with a newline after the last row', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'a@b.com', score: 50 }],
    });
    expect(csv.endsWith('\n')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect all pass (no implementation change needed)**

Run: `npx vitest run lib/export/csv.test.ts`
Expected: PASS — 13/13.

If a test fails, the rfc4180 helper has a bug. Inspect, fix, and re-run before committing.

- [ ] **Step 3: Run coverage gate**

Run: `npx vitest run lib/export/csv.test.ts --coverage`
Expected: `lib/export/csv.ts` shows 100% line and 100% branch coverage in the report. If anything is uncovered, add a test that covers it.

- [ ] **Step 4: Commit**

```bash
git add lib/export/csv.test.ts
git commit -m "test(csv): add RFC-4180 email + empty-rows + trailing-newline coverage"
git push
```

---

## Task 6: Route Handler `app/api/gradebook/[id]/csv/route.ts` — happy path

**Files:**

- Create: `app/api/gradebook/[id]/csv/route.ts`
- Create: `app/api/gradebook/[id]/csv/route.test.ts`

**⚠ Recurring-bug check:** `createServerSupabaseClient()` is **async** — every call must be `await`ed. Failing to await produces `Cannot read properties of undefined (reading 'auth')` in production while unit tests still pass (mocks return synchronously).

- [ ] **Step 1: Write failing happy-path test with mocked Supabase**

Create `app/api/gradebook/[id]/csv/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/require', () => ({
  requireInstructor: vi.fn(),
}));

import { GET } from './route';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireInstructor } from '@/lib/auth/require';

function makeRequest(): Request {
  return new Request('http://localhost/api/gradebook/asmt-1/csv');
}

function mockSupabase(impl: {
  assessment: { id: string; title: string } | null;
  rows: Array<{ student_email: string; best_pct: number | null }>;
  auditOk?: boolean;
}) {
  const fromMock = vi.fn((table: string) => {
    if (table === 'assessments') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: impl.assessment, error: null }),
      };
    }
    if (table === 'gradebook_rows') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: impl.rows, error: null }),
      };
    }
    if (table === 'audit_log') {
      return {
        insert: vi
          .fn()
          .mockResolvedValue({ error: impl.auditOk === false ? new Error('audit fail') : null }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock };
}

describe('GET /api/gradebook/[id]/csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns CSV for an instructor-owned assessment', async () => {
    vi.mocked(requireInstructor).mockResolvedValue({
      id: 'inst-1',
      email: 'i@p.edu',
      role: 'instructor',
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({
        assessment: { id: 'asmt-1', title: 'Quiz 1' },
        rows: [
          { student_email: 'a@b.com', best_pct: 87.5 },
          { student_email: 'c@d.com', best_pct: null },
        ],
      }) as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-1' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="quiz-1-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const body = await res.text();
    expect(body).toBe(
      'Student,SIS User ID,SIS Login ID,Quiz 1\n' +
        'a@b.com,,a@b.com,87.50\n' +
        'c@d.com,,c@d.com,\n',
    );
  });
});
```

- [ ] **Step 2: Run test — expect failure (module not found)**

Run: `npx vitest run app/api/gradebook/[id]/csv/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the Route Handler**

Create `app/api/gradebook/[id]/csv/route.ts`:

```ts
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireInstructor } from '@/lib/auth/require';
import { buildCanvasCsv, type CsvRow } from '@/lib/export/csv';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const caller = await requireInstructor();
  const supabase = await createServerSupabaseClient();

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, title')
    .eq('id', id)
    .maybeSingle();

  if (!assessment) {
    return new Response('Not found', { status: 404 });
  }

  const { data: rows } = await supabase
    .from('gradebook_rows')
    .select('student_email, best_pct')
    .eq('assessment_id', id);

  const csvRows: CsvRow[] = (rows ?? []).map((r) => ({
    email: r.student_email ?? '',
    score: r.best_pct === null ? null : Number(r.best_pct),
  }));

  const csv = buildCanvasCsv({ assessmentTitle: assessment.title, rows: csvRows });

  await supabase.from('audit_log').insert({
    actor_user_id: caller.id,
    action: 'csv_export',
    target_kind: 'assessment',
    target_id: id,
    after: { row_count: csvRows.length },
  });

  const slug = slugify(assessment.title);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${slug}-${dateStr}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npx vitest run app/api/gradebook/[id]/csv/route.test.ts`
Expected: PASS — 1/1.

- [ ] **Step 5: Verify await on createServerSupabaseClient**

Run: `grep "createServerSupabaseClient" app/api/gradebook/\[id\]/csv/route.ts`
Expected: `const supabase = await createServerSupabaseClient();` — the `await` MUST be present. If not, fix before proceeding.

- [ ] **Step 6: Commit**

```bash
git add app/api/gradebook/\[id\]/csv/route.ts app/api/gradebook/\[id\]/csv/route.test.ts
git commit -m "feat(api): add gradebook CSV export route handler"
git push
```

---

## Task 7: Route Handler edge cases — 401/403/404 + best-effort audit log

**Files:**

- Modify: `app/api/gradebook/[id]/csv/route.test.ts`
- Modify: `app/api/gradebook/[id]/csv/route.ts` (only if tests reveal gaps)

- [ ] **Step 1: Add failing edge-case tests**

Append to `app/api/gradebook/[id]/csv/route.test.ts`:

```ts
describe('GET /api/gradebook/[id]/csv — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the assessment is not found or not owned by caller', async () => {
    vi.mocked(requireInstructor).mockResolvedValue({
      id: 'inst-1',
      email: 'i@p.edu',
      role: 'instructor',
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({ assessment: null, rows: [] }) as unknown as Awaited<
        ReturnType<typeof createServerSupabaseClient>
      >,
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-missing' }) });

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
  });

  it('returns header-only CSV when assessment exists but has no rows', async () => {
    vi.mocked(requireInstructor).mockResolvedValue({
      id: 'inst-1',
      email: 'i@p.edu',
      role: 'instructor',
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({
        assessment: { id: 'asmt-1', title: 'Empty Quiz' },
        rows: [],
      }) as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-1' }) });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Student,SIS User ID,SIS Login ID,Empty Quiz\n');
  });

  it('returns 200 even when audit_log insert fails (best-effort)', async () => {
    vi.mocked(requireInstructor).mockResolvedValue({
      id: 'inst-1',
      email: 'i@p.edu',
      role: 'instructor',
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({
        assessment: { id: 'asmt-1', title: 'Quiz' },
        rows: [{ student_email: 'a@b.com', best_pct: 50 }],
        auditOk: false,
      }) as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-1' }) });

    expect(res.status).toBe(200);
  });

  it('propagates 401/403 from requireInstructor by rethrowing (auth helper handles redirects)', async () => {
    vi.mocked(requireInstructor).mockRejectedValue(new Error('redirect'));
    await expect(GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-1' }) })).rejects.toThrow(
      'redirect',
    );
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run app/api/gradebook/[id]/csv/route.test.ts`
Expected:

- 404 test: PASS (already implemented).
- Empty assessment test: PASS (already implemented).
- Audit best-effort test: FAIL — current code awaits the insert and the test doesn't check that we don't throw, but if the mock returns `{ error: new Error(...) }` without throwing, the await still resolves and we proceed. Re-read the implementation to confirm and adjust the test or implementation as needed.
- requireInstructor reject test: PASS (we let it throw).

- [ ] **Step 3: If audit-best-effort test fails, harden the implementation**

If the audit insert can throw (network error, etc.) and the test expects 200, wrap the audit insert in a try/catch:

In `app/api/gradebook/[id]/csv/route.ts`, replace the audit-log block with:

```ts
try {
  await supabase.from('audit_log').insert({
    actor_user_id: caller.id,
    action: 'csv_export',
    target_kind: 'assessment',
    target_id: id,
    after: { row_count: csvRows.length },
  });
} catch {
  // Best-effort; surfaced via Sentry once T19+ ships.
}
```

- [ ] **Step 4: Re-run tests — expect all pass**

Run: `npx vitest run app/api/gradebook/[id]/csv/route.test.ts`
Expected: PASS — 5/5.

- [ ] **Step 5: Commit**

```bash
git add app/api/gradebook/\[id\]/csv/route.ts app/api/gradebook/\[id\]/csv/route.test.ts
git commit -m "feat(api): handle CSV route edge cases (404, empty, audit best-effort)"
git push
```

---

## Task 8: `<DownloadCsvButton>` Client Component with download trigger

**Files:**

- Create: `components/instructor/DownloadCsvButton.tsx`
- Create: `components/instructor/DownloadCsvButton.test.tsx`

**Component requirements** (from spec §2.4):

- Renders a button labeled "Download CSV".
- On click: disables button, shows spinner, fetches `/api/gradebook/[id]/csv`.
- On 200: reads blob, triggers download via a hidden `<a>` with `download="<filename>"`.
- On non-200: toasts an error via `sonner`. Re-enables button.
- `aria-label="Download gradebook CSV for <assessmentTitle>"`; spinner status has `aria-live="polite"`.

- [ ] **Step 1: Write failing component tests**

Create `components/instructor/DownloadCsvButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DownloadCsvButton } from './DownloadCsvButton';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const originalFetch = global.fetch;
const originalCreateObjectURL = global.URL.createObjectURL;
const originalRevokeObjectURL = global.URL.revokeObjectURL;

beforeEach(() => {
  vi.clearAllMocks();
  global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  global.URL.createObjectURL = originalCreateObjectURL;
  global.URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('<DownloadCsvButton>', () => {
  it('renders with accessible label', () => {
    render(<DownloadCsvButton assessmentId="a-1" assessmentTitle="Quiz 1" />);
    expect(
      screen.getByRole('button', { name: /download gradebook csv for quiz 1/i }),
    ).toBeInTheDocument();
  });

  it('triggers download on click when fetch succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('Student,SIS User ID,SIS Login ID,Quiz\na@b.com,,a@b.com,50.00\n', {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="quiz-2026-05-26.csv"' },
      }),
    );
    render(<DownloadCsvButton assessmentId="a-1" assessmentTitle="Quiz" />);
    const button = screen.getByRole('button', { name: /download/i });

    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/gradebook/a-1/csv');
    });
    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it('disables the button while a fetch is in flight', async () => {
    let resolveFetch: (v: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolveFetch = r)));
    render(<DownloadCsvButton assessmentId="a-1" assessmentTitle="Quiz" />);
    const button = screen.getByRole('button', { name: /download/i });

    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());

    resolveFetch(new Response('header\n', { status: 200 }));
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('toasts error on non-200', async () => {
    const { toast } = await import('sonner');
    global.fetch = vi.fn().mockResolvedValue(new Response('Not found', { status: 404 }));
    render(<DownloadCsvButton assessmentId="a-1" assessmentTitle="Quiz" />);
    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
```

Note: the test file uses `afterEach` — add `import { afterEach } from 'vitest';` at top.

- [ ] **Step 2: Run tests — expect failure**

Run: `npx vitest run components/instructor/DownloadCsvButton.test.tsx`
Expected: FAIL — `Cannot find module './DownloadCsvButton'`.

- [ ] **Step 3: Implement the component**

Create `components/instructor/DownloadCsvButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Props = {
  assessmentId: string;
  assessmentTitle: string;
};

function extractFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = disposition.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

export function DownloadCsvButton({ assessmentId, assessmentTitle }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/gradebook/${assessmentId}/csv`);
      if (!res.ok) {
        toast.error(`Download failed: ${res.status} ${res.statusText}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = extractFilename(res.headers.get('Content-Disposition'), 'gradebook.csv');
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Download failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={`Download gradebook CSV for ${assessmentTitle}`}
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          <span aria-live="polite">Preparing download…</span>
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download CSV
        </>
      )}
    </Button>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run components/instructor/DownloadCsvButton.test.tsx`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add components/instructor/DownloadCsvButton.tsx components/instructor/DownloadCsvButton.test.tsx
git commit -m "feat(components): add DownloadCsvButton client component"
git push
```

---

## Task 9: Mount `<DownloadCsvButton>` on gradebook page

**Files:**

- Modify: `app/(instructor)/assessments/[id]/attempts/page.tsx`

- [ ] **Step 1: Read the existing gradebook page to find the mount point**

Run: `cat "app/(instructor)/assessments/[id]/attempts/page.tsx"`
Identify the header / breadcrumb area where the title is rendered. The button should sit alongside the title.

- [ ] **Step 2: Add the import + element**

In `app/(instructor)/assessments/[id]/attempts/page.tsx`:

Add to imports:

```ts
import { DownloadCsvButton } from '@/components/instructor/DownloadCsvButton';
```

In the JSX, place `<DownloadCsvButton assessmentId={id} assessmentTitle={assessment.title} />` next to the assessment title heading. Use a flex container if needed to align it. Example:

```tsx
<div className="flex items-center justify-between gap-4">
  <h1 className="text-2xl font-semibold">{assessment.title}</h1>
  <DownloadCsvButton assessmentId={id} assessmentTitle={assessment.title} />
</div>
```

Match the existing page's style; only add the button + flex wrapper if no equivalent header layout exists.

- [ ] **Step 3: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Run vitest to confirm nothing regressed**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run: `npm run dev` and visit the instructor gradebook page in a browser. Confirm the button renders next to the title and clicking it triggers a CSV download.

- [ ] **Step 6: Commit**

```bash
git add "app/(instructor)/assessments/[id]/attempts/page.tsx"
git commit -m "feat(gradebook): mount DownloadCsvButton on gradebook page"
git push
```

---

## Task 10: E2E spec — `tests/e2e/csv-export.spec.ts`

**Files:**

- Create: `tests/e2e/csv-export.spec.ts`

This follows the inline-seeding pattern Plan 3 established (see `tests/instructor/gradebook-shows-attempts.spec.ts` for the canonical example). No new helpers needed — `adminClient`, `createTestUserClient`, `deleteTestUser`, and `signInBrowser` are sufficient.

- [ ] **Step 1: Create `tests/e2e/` directory if it doesn't exist**

Run: `ls tests/e2e/ 2>/dev/null || mkdir -p tests/e2e`

(Plan 3 placed E2E specs under `tests/student/` and `tests/instructor/`. For Plan 4 we add a new `tests/e2e/` directory; the Playwright config picks up any `**/*.spec.ts` under `tests/` regardless.)

- [ ] **Step 2: Write the E2E spec**

Create `tests/e2e/csv-export.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('CSV export', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('instructor downloads Canvas-import-compatible CSV from gradebook page', async ({
    page,
    context,
  }) => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t10-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const s1Email = `t10-s1-${stamp}@test.local`;
    const s2Email = `t10-s2-${stamp}@test.local`;
    const s3Email = `t10-s3-${stamp}@test.local`;
    const s1 = await createTestUserClient({ email: s1Email, password: 'test-pw-1!' });
    cleanupIds.push(s1.userId);
    const s2 = await createTestUserClient({ email: s2Email, password: 'test-pw-1!' });
    cleanupIds.push(s2.userId);
    const s3 = await createTestUserClient({ email: s3Email, password: 'test-pw-1!' });
    cleanupIds.push(s3.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'CSV Export Test Quiz',
        slug: `csv-test-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed assessment failed');

    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: a.id,
        position: 0,
        type: 'tf',
        body: { stem: 'T?' },
        scoring: { correct: true },
      })
      .select('id')
      .single();
    if (!q) throw new Error('seed question failed');

    const snap = (correct: boolean) => ({
      question_id: q.id,
      question_type: 'tf',
      seed: 1,
      rendered_at: 'x',
      render: {
        materialized_values: {},
        rendered_stem: 'T?',
        rendered_body: { kind: 'tf' },
        grading_target: { kind: 'tf', correct },
        validation_errors: [],
      },
    });

    // s1 = 87.5%, s2 = null (no submission), s3 = 100%.
    // For null (s2), we DON'T insert an attempt — the gradebook view returns 0 rows for that student.
    for (const { sid, pct } of [
      { sid: s1.userId, pct: 87.5 },
      { sid: s3.userId, pct: 100 },
    ]) {
      const { data: at } = await admin
        .from('attempts')
        .insert({
          assessment_id: a.id,
          student_user_id: sid,
          attempt_no: 1,
          seed: 1,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          summary: { raw_score: pct / 100, max_score: 1, percentage: pct },
        })
        .select('id')
        .single();
      if (!at) throw new Error('seed attempt failed');
      await admin.from('answers').insert({
        attempt_id: at.id,
        question_id: q.id,
        rendered_question_snapshot: snap(true),
        response: { type: 'tf', value: pct > 50 },
        auto_score: pct / 100,
        score_method: 'auto',
        graded_at: new Date().toISOString(),
      });
    }

    await signInBrowser(context, inst);
    await page.goto(`/assessments/${a.id}/attempts`);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download gradebook csv/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^csv-export-test-quiz-\d{4}-\d{2}-\d{2}\.csv$/);

    const path = await download.path();
    if (!path) throw new Error('download path missing');
    const fs = await import('node:fs/promises');
    const body = await fs.readFile(path, 'utf-8');

    const lines = body.split('\n');
    expect(lines[0]).toBe('Student,SIS User ID,SIS Login ID,CSV Export Test Quiz');
    expect(lines).toContain(`${s1Email},,${s1Email},87.50`);
    expect(lines).toContain(`${s3Email},,${s3Email},100.00`);
    // s2 did not submit; should not appear in gradebook_rows output.
    expect(body).not.toContain(s2Email);
  });
});
```

- [ ] **Step 3: Run the E2E**

Run: `npx playwright test tests/e2e/csv-export.spec.ts`
Expected: PASS — 1/1.

If it fails, common causes:

- Download button selector mismatch (verify the `aria-label` from T8 matches `/download gradebook csv/i`).
- `gradebook_rows` view returns `best_pct` as numeric but `summary->>'percentage'` materialization differs from the test's expected 87.50 / 100.00 formatting — verify by querying the view directly with `psql`.
- Filename slug mismatch — the route's `slugify` converts "CSV Export Test Quiz" → "csv-export-test-quiz"; if not, fix the slugify in `app/api/gradebook/[id]/csv/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/csv-export.spec.ts
git commit -m "test(e2e): add CSV export download spec"
git push
```

---

## Task 11: RLS spec — `tests/rls/csv-export-rls.spec.ts`

**Files:**

- Create: `tests/rls/csv-export-rls.spec.ts`

This follows the inline-seeding pattern Plan 3's RLS specs use (`tests/rls/attempts-isolation.spec.ts` is the canonical reference). No new helpers; everything is built from `adminClient` + `createTestUserClient` + `signInBrowser`.

- [ ] **Step 1: Write the RLS spec**

Create `tests/rls/csv-export-rls.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('CSV export — RLS isolation', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test("instructor A cannot CSV-export instructor B's assessment (404, not 403, no leak)", async ({
    page,
    context,
  }) => {
    const admin = adminClient();
    const stamp = Date.now();

    const instA = await createTestUserClient({
      email: `t11-instA-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(instA.userId);
    const instB = await createTestUserClient({
      email: `t11-instB-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(instB.userId);

    // Assessment owned by B.
    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: instB.userId,
        title: 'B-owned Quiz',
        slug: `b-owned-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed assessment failed');

    // Sign in as INSTRUCTOR A.
    await signInBrowser(context, instA);
    const res = await page.request.get(`/api/gradebook/${a.id}/csv`);
    expect(res.status()).toBe(404);
    expect(await res.text()).toBe('Not found');
  });

  test('student cannot hit the route at all', async ({ page, context }) => {
    const admin = adminClient();
    const stamp = Date.now();

    const inst = await createTestUserClient({
      email: `t11-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t11-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'Q',
        slug: `q-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed assessment failed');

    await signInBrowser(context, student);
    const res = await page.request.get(`/api/gradebook/${a.id}/csv`);
    // requireInstructor() throws → Next renders an error response. Expect non-200.
    expect(res.status()).not.toBe(200);
  });
});
```

- [ ] **Step 2: Run the RLS spec**

Run: `npx playwright test tests/rls/csv-export-rls.spec.ts`
Expected: PASS — 2/2.

If the cross-instructor test returns 200 instead of 404, RLS on `assessments` is wrong — check that `assessments_instructor_select` policy in `supabase/migrations/0010_rls_policies.sql` filters by `owner_user_id = auth.uid()`. If correct in the policy but the test still fails, the `requireInstructor()` helper may be bypassing RLS somehow — inspect `lib/auth/require.ts`.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/csv-export-rls.spec.ts
git commit -m "test(rls): add CSV export cross-instructor + student isolation"
git push
```

---

## Task 12: a11y spec — `tests/a11y/gradebook-csv-button.spec.ts`

**Files:**

- Create: `tests/a11y/gradebook-csv-button.spec.ts`

Follows the same inline-seeding pattern as Plan 3's `tests/a11y/gradebook.spec.ts` (use that as a reference for spacing/structure).

- [ ] **Step 1: Write the a11y spec**

Create `tests/a11y/gradebook-csv-button.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('Gradebook page a11y (with CSV download button)', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  async function seedAssessmentWithOneAttempt(stamp: number) {
    const admin = adminClient();
    const inst = await createTestUserClient({
      email: `t12-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t12-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'A11y Test Quiz',
        slug: `a11y-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed assessment failed');

    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: a.id,
        position: 0,
        type: 'tf',
        body: { stem: 'T?' },
        scoring: { correct: true },
      })
      .select('id')
      .single();
    if (!q) throw new Error('seed question failed');

    const { data: at } = await admin
      .from('attempts')
      .insert({
        assessment_id: a.id,
        student_user_id: student.userId,
        attempt_no: 1,
        seed: 1,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        summary: { raw_score: 0.75, max_score: 1, percentage: 75 },
      })
      .select('id')
      .single();
    if (!at) throw new Error('seed attempt failed');
    await admin.from('answers').insert({
      attempt_id: at.id,
      question_id: q.id,
      rendered_question_snapshot: {
        question_id: q.id,
        question_type: 'tf',
        seed: 1,
        rendered_at: 'x',
        render: {
          materialized_values: {},
          rendered_stem: 'T?',
          rendered_body: { kind: 'tf' },
          grading_target: { kind: 'tf', correct: true },
          validation_errors: [],
        },
      },
      response: { type: 'tf', value: true },
      auto_score: 0.75,
      score_method: 'auto',
      graded_at: new Date().toISOString(),
    });

    return { inst, assessmentId: a.id };
  }

  test('passes axe-core WCAG 2.2 AA scan', async ({ page, context }) => {
    const { inst, assessmentId } = await seedAssessmentWithOneAttempt(Date.now());
    await signInBrowser(context, inst);
    await page.goto(`/assessments/${assessmentId}/attempts`);
    await page.getByRole('button', { name: /download gradebook csv/i }).waitFor();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('download button is keyboard-focusable with a visible focus indicator', async ({
    page,
    context,
  }) => {
    const { inst, assessmentId } = await seedAssessmentWithOneAttempt(Date.now() + 1);
    await signInBrowser(context, inst);
    await page.goto(`/assessments/${assessmentId}/attempts`);

    const button = page.getByRole('button', { name: /download gradebook csv/i });
    await button.focus();
    await expect(button).toBeFocused();

    const outline = await button.evaluate((el) => getComputedStyle(el).outlineStyle);
    const boxShadow = await button.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(outline !== 'none' || boxShadow !== 'none').toBe(true);
  });
});
```

- [ ] **Step 2: Run the a11y spec**

Run: `npx playwright test tests/a11y/gradebook-csv-button.spec.ts`
Expected: PASS — 2/2.

If axe reports violations, fix them in the component or page (most common: insufficient color contrast on the button, missing visible focus ring, missing accessible name).

- [ ] **Step 3: Commit**

```bash
git add tests/a11y/gradebook-csv-button.spec.ts
git commit -m "test(a11y): add gradebook CSV button accessibility coverage"
git push
```

---

## Task 13: Create Backblaze B2 account + bucket (manual, documented)

**Files:**

- No code changes. This task is operator-side setup.

- [ ] **Step 1: Sign up for B2 (free tier)**

Visit https://www.backblaze.com/cloud-storage and create a free account using the instructor's email. Free tier: 10 GB storage + free egress up to 3× stored.

- [ ] **Step 2: Create the bucket**

In the B2 dashboard:

- Bucket name: `bodhilite-backups-prod`
- Bucket type: **Private**
- Default encryption: SSE-B2 (B2-managed; defense-in-depth alongside our `age` CI-side encryption)
- Object lock: **Enabled, 30 days, Compliance mode** — prevents accidental deletion via API for 30 days even if the application key is later compromised.

- [ ] **Step 3: Create an application key scoped to this bucket**

In the B2 dashboard → Application Keys → Add a New Application Key:

- Name: `bodhilite-ci-backup`
- Allow access to: `bodhilite-backups-prod` only (NOT master key, NOT all buckets)
- Type of access: Read and Write
- File name prefix: (blank)
- Duration: (no expiry, OR set a 1-year expiry for rotation discipline)

Capture the `keyID` (B2_ACCOUNT_ID) and `applicationKey` (B2_APPLICATION_KEY) values **immediately** — B2 shows the applicationKey only once.

- [ ] **Step 4: Store credentials securely**

Save `keyID` and `applicationKey` in the instructor's 1Password vault under an item named "BodhiLite — B2 CI backup key". Note creation date and expiry.

- [ ] **Step 5: Document in the restore-from-b2 runbook (this gets created in T18)**

No-op for now — the runbook task references these credentials.

- [ ] **Step 6: No commit needed (manual step)**

Move on to T14.

---

## Task 14: Generate age keypair (manual, documented)

**Files:**

- No code changes.

- [ ] **Step 1: Install age locally**

Choose one:

- Windows (winget): `winget install FiloSottile.age`
- macOS (Homebrew): `brew install age`
- Linux (apt): `sudo apt-get install age`

Verify: `age --version` prints a version ≥ 1.1.

- [ ] **Step 2: Generate the keypair**

Run: `age-keygen -o age-bodhilite.key`

Expected output:

```
Public key: age1<long-string>
```

The file `age-bodhilite.key` contains the **private key**. Do NOT commit it.

- [ ] **Step 3: Store the private key in 1Password**

Open `age-bodhilite.key` in a text editor; copy the entire file contents (multiple lines including the `# created: …` comment, `# public key: …` comment, and the `AGE-SECRET-KEY-…` value).

In 1Password: create a new Secure Note item named "BodhiLite — age private key (production backups)". Paste the full file contents. Add tags `backup`, `production`, `do-not-delete`.

- [ ] **Step 4: Print and store an offline paper backup**

Print the same private key contents onto a single sheet of paper. Store the paper in a physical safe or another secure offline location. Label it "BodhiLite age private key — DO NOT DISCARD".

This is the **catastrophic-loss mitigation**. Without this paper, if 1Password becomes inaccessible AND the GitHub Actions secret is the only place left, all encrypted backups become permanently unreadable.

- [ ] **Step 5: Delete the local file**

Once both copies (1Password + paper) are verified, securely delete the local file.

Windows PowerShell: `Remove-Item .\age-bodhilite.key -Force`
macOS/Linux: `shred -u age-bodhilite.key` (or `srm age-bodhilite.key`).

- [ ] **Step 6: Capture the PUBLIC key**

The public key (the `age1...` string from Step 2) is what goes in the GitHub Actions secret. It is NOT sensitive — but record it now so it's ready for T15.

Save the public key as a 1Password note titled "BodhiLite — age public key" (in case it ever needs to be re-pulled).

- [ ] **Step 7: No commit needed (manual step)**

Move on to T15.

---

## Task 15: Add GitHub Actions secrets

**Files:**

- No code changes. Configuration on github.com.

- [ ] **Step 1: Get the Supabase production DB connection string**

In the Supabase dashboard → Project Settings → Database → Connection string (URI format with the **postgres** user, not pooled). It looks like:

```
postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

- [ ] **Step 2: Add each secret to the GitHub repository**

In github.com → Repository Settings → Secrets and variables → Actions → New repository secret:

| Name                 | Value                                    |
| -------------------- | ---------------------------------------- |
| `SUPABASE_DB_URL`    | The postgres URI from Step 1             |
| `AGE_PUBKEY`         | The `age1...` public key from T14 Step 6 |
| `B2_ACCOUNT_ID`      | The `keyID` from T13 Step 3              |
| `B2_APPLICATION_KEY` | The `applicationKey` from T13 Step 3     |
| `B2_BUCKET`          | `bodhilite-backups-prod`                 |

- [ ] **Step 3: Verify the secrets are set**

In the Secrets page, confirm all five names appear in the list. (Values are hidden; only existence is verifiable through the UI.)

- [ ] **Step 4: No commit needed (manual step)**

Move on to T16.

---

## Task 16: Shell test for `scripts/backup-retention-guard.sh`

**Files:**

- Create: `scripts/backup-retention-guard.sh`
- Create: `scripts/backup-retention-guard.test.sh`

- [ ] **Step 1: Write the retention-guard script**

Create `scripts/backup-retention-guard.sh`:

```bash
#!/usr/bin/env bash
# Refuse to delete old backups unless a backup from the last 24h exists.
# Run after a successful upload step in .github/workflows/backup-daily.yml.
#
# Required env vars:
#   B2_BUCKET — bucket name (rclone remote is configured as `b2:` in the workflow)
#
# Exits 0 on success (sweep performed or no sweep needed).
# Exits 1 if no recent backup exists (sweep would be unsafe).
set -euo pipefail

: "${B2_BUCKET:?B2_BUCKET must be set}"

recent=$(rclone lsf "b2:${B2_BUCKET}/" --max-age 24h | wc -l)
if [ "$recent" -lt 1 ]; then
  echo "ERROR: no backup uploaded in last 24h; refusing to sweep" >&2
  exit 1
fi

rclone delete "b2:${B2_BUCKET}/" --min-age 30d
echo "Retention sweep complete."
```

Make it executable: `chmod +x scripts/backup-retention-guard.sh` (note: chmod doesn't affect Windows git checkouts; the workflow runs on Linux runners where execute bit is honored. Use `git update-index --chmod=+x scripts/backup-retention-guard.sh` to set the bit in git).

- [ ] **Step 2: Write the shell test**

Create `scripts/backup-retention-guard.test.sh`:

```bash
#!/usr/bin/env bash
# Test: backup-retention-guard.sh refuses to sweep when no recent backup exists.
#
# Uses a stub `rclone` on PATH that returns canned output.
# Requires bash 4+; no other dependencies.
set -euo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Test 1: no recent backups → script exits 1
cat > "$TMP/rclone" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  lsf) ;;  # empty output: zero lines
  delete) echo "should not run"; exit 99 ;;
esac
STUB
chmod +x "$TMP/rclone"

if PATH="$TMP:$PATH" B2_BUCKET=test bash scripts/backup-retention-guard.sh 2>/dev/null; then
  echo "FAIL: expected exit 1 when no recent backup, got 0"
  exit 1
fi
echo "OK: refuses to sweep with no recent backup"

# Test 2: at least one recent backup → script exits 0 and calls rclone delete
cat > "$TMP/rclone" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  lsf) echo "2026-07-06T09-00-00Z/dump.pgc.age" ;;
  delete) echo "rclone-delete-called" ;;
esac
STUB
chmod +x "$TMP/rclone"

out="$(PATH="$TMP:$PATH" B2_BUCKET=test bash scripts/backup-retention-guard.sh 2>&1)"
echo "$out" | grep -q "rclone-delete-called" || {
  echo "FAIL: rclone delete was not invoked"
  echo "Output was: $out"
  exit 1
}
echo "OK: sweeps when recent backup exists"

echo "All retention-guard tests passed."
```

- [ ] **Step 3: Run the test**

Run: `bash scripts/backup-retention-guard.test.sh`
Expected:

```
OK: refuses to sweep with no recent backup
OK: sweeps when recent backup exists
All retention-guard tests passed.
```

(Windows note: requires Git Bash, WSL, or another bash environment. On the CI Linux runner this runs natively.)

- [ ] **Step 4: Commit**

```bash
git add scripts/backup-retention-guard.sh scripts/backup-retention-guard.test.sh
git update-index --chmod=+x scripts/backup-retention-guard.sh
git update-index --chmod=+x scripts/backup-retention-guard.test.sh
git commit -m "feat(scripts): add backup retention guard with shell test"
git push
```

---

## Task 17: `.github/workflows/backup-daily.yml`

**Files:**

- Create: `.github/workflows/backup-daily.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/backup-daily.yml`:

```yaml
name: Daily backup

on:
  schedule:
    # 09:00 UTC daily = 02:00 PT (PST) / 01:00 PT (PDT). Cron has no DST awareness.
    - cron: '0 9 * * *'
  workflow_dispatch: {}

concurrency:
  group: backup-daily
  cancel-in-progress: false

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Install age + rclone
        run: |
          sudo apt-get update
          sudo apt-get install -y age rclone

      - name: Configure rclone for B2
        env:
          B2_ACCOUNT_ID: ${{ secrets.B2_ACCOUNT_ID }}
          B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}
        run: |
          mkdir -p "${HOME}/.config/rclone"
          cat > "${HOME}/.config/rclone/rclone.conf" <<EOF
          [b2]
          type = b2
          account = ${B2_ACCOUNT_ID}
          key = ${B2_APPLICATION_KEY}
          EOF

      - name: Dump + encrypt + upload (pipe-only, no plaintext on disk)
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
          AGE_PUBKEY: ${{ secrets.AGE_PUBKEY }}
          B2_BUCKET: ${{ secrets.B2_BUCKET }}
        run: |
          set -euo pipefail
          ts="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
          pg_dump --format=custom "${SUPABASE_DB_URL}" \
            | age -r "${AGE_PUBKEY}" \
            | rclone rcat "b2:${B2_BUCKET}/${ts}/dump.pgc.age"
          echo "Uploaded dump to b2:${B2_BUCKET}/${ts}/dump.pgc.age"

      - name: Retention sweep (guarded)
        env:
          B2_BUCKET: ${{ secrets.B2_BUCKET }}
        run: bash scripts/backup-retention-guard.sh
```

- [ ] **Step 2: Sanity check the YAML**

Run: `npx --yes js-yaml .github/workflows/backup-daily.yml > /dev/null` (or open in a YAML linter).
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backup-daily.yml
git commit -m "feat(ci): add daily encrypted pg_dump backup workflow"
git push
```

---

## Task 18: `docs/runbooks/restore-from-b2.md` + manual first-run verification

**Files:**

- Create: `docs/runbooks/restore-from-b2.md`

- [ ] **Step 1: Manually trigger the workflow to verify it works**

In github.com → Actions → "Daily backup" → Run workflow → run on `wave-1-plan4-ops` branch.

Wait for the workflow to complete (target < 3 min). Check the logs:

- pg_dump step exits 0
- age + rclone step prints "Uploaded dump to b2:bodhilite-backups-prod/<timestamp>/dump.pgc.age"
- Retention sweep prints "Retention sweep complete."

In the B2 dashboard → bucket → browse files: confirm a file at `<timestamp>/dump.pgc.age` exists with non-zero size (expected: ~5–50 MB depending on current data).

If anything fails, debug before proceeding.

- [ ] **Step 2: Write the runbook**

Create `docs/runbooks/restore-from-b2.md`:

```markdown
# Runbook: Restore from a B2 backup

**Purpose:** Decrypt a B2-stored pg_dump and restore it into a Postgres database.
Called by the restore-drill runbook and used during real incidents.

## Prerequisites

- `age` installed locally (≥ 1.1)
- `rclone` installed locally and configured with the same B2 application key used by
  the GH Actions workflow (or the production application key from 1Password).
  Config at `~/.config/rclone/rclone.conf`:
```

[b2]
type = b2
account = <B2_ACCOUNT_ID>
key = <B2_APPLICATION_KEY>

````
- `pg_restore` (`postgresql-client` package) installed.
- The `age` PRIVATE key from 1Password ("BodhiLite — age private key"). Save it to
a file `age-bodhilite.key` in a secure temp location. **Never commit this file.**

## Steps

1. **List recent backups:**
 ```bash
 rclone lsf "b2:bodhilite-backups-prod/" | sort | tail -n 5
````

Pick the most recent timestamp directory (or a specific older one if doing a
point-in-time restore).

2. **Download the encrypted dump:**

   ```bash
   TS="2026-07-06T09-00-12Z"   # replace with the chosen timestamp
   rclone copy "b2:bodhilite-backups-prod/${TS}/dump.pgc.age" "./restore-${TS}/"
   ```

3. **Decrypt with age:**

   ```bash
   age --decrypt --identity age-bodhilite.key \
     -o "./restore-${TS}/dump.pgc" \
     "./restore-${TS}/dump.pgc.age"
   ```

4. **Restore into a target Postgres:**

   ```bash
   TARGET_URL="postgresql://postgres:<password>@db.<target>.supabase.co:5432/postgres"
   pg_restore --verbose --no-owner --no-acl \
     --dbname="${TARGET_URL}" \
     "./restore-${TS}/dump.pgc"
   ```

   - `--no-owner --no-acl` skip ownership commands that fail against managed Postgres.
   - `--verbose` shows progress for ~thousands of objects.

5. **Verify with smoke SQL:**

   ```sql
   SELECT 'users' AS table, count(*) FROM users
   UNION ALL SELECT 'assessments', count(*) FROM assessments
   UNION ALL SELECT 'attempts',    count(*) FROM attempts
   UNION ALL SELECT 'answers',     count(*) FROM answers
   UNION ALL SELECT 'audit_log',   count(*) FROM audit_log;
   ```

6. **Securely delete local copies:**
   ```bash
   shred -u "./restore-${TS}/"*.pgc "./restore-${TS}/"*.pgc.age age-bodhilite.key
   ```

## Troubleshooting

- **`age: error: no identity matched any of the recipients`** — the private key is
  not the one paired with the public key used at encryption time. Verify you're
  using the production keypair from 1Password, not a different keypair.
- **`pg_restore: error: connection failed`** — confirm the target DB allows
  connections from your IP (Supabase Project Settings → Database → Connection
  pooling / Allowed IPs).
- **`pg_restore: warning: errors ignored on restore: N`** — N small means
  expected ownership/ACL skips (we use `--no-owner --no-acl`). N large means
  schema mismatch — escalate.

````

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/restore-from-b2.md
git commit -m "docs(runbooks): add restore-from-b2 procedure + verify first backup ran"
git push
````

---

## Task 19: TDD `lib/observability/scrub.ts` — full scrub module

**Files:**

- Create: `lib/observability/scrub.ts`
- Create: `lib/observability/scrub.test.ts`

This task is the FERPA load-bearing core of Plan 4. Target 100% line + branch coverage.

- [ ] **Step 1: Write the failing test suite**

Create `lib/observability/scrub.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scrubSentryEvent } from './scrub';
import type { Event } from '@sentry/nextjs';

const HMAC_KEY = 'test-hmac-key-do-not-use-in-prod';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: 'evt-1',
    message: 'something broke',
    ...overrides,
  } as Event;
}

describe('scrubSentryEvent', () => {
  it('returns the event with no-op changes when there is no PII', () => {
    const e = makeEvent({ message: 'plain error' });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    expect(out.message).toBe('plain error');
  });

  it('scrubs request.data (POST body)', () => {
    const e = makeEvent({
      request: { data: 'answer=42&studentEmail=a@b.com' } as Event['request'],
    });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    expect(out.request?.data).toBe('[scrubbed]');
  });

  it('scrubs request.query_string', () => {
    const e = makeEvent({
      request: { query_string: 'token=abc&email=a@b.com' } as Event['request'],
    });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    expect(out.request?.query_string).toBe('[scrubbed]');
  });

  it('deletes request.cookies', () => {
    const e = makeEvent({
      request: { cookies: { session: 'abc' } } as unknown as Event['request'],
    });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    expect(out.request?.cookies).toBeUndefined();
  });

  it('scrubs authorization + cookie + x-supabase-* request headers (preserves keys)', () => {
    const e = makeEvent({
      request: {
        headers: {
          authorization: 'Bearer abc',
          Cookie: 'session=xyz',
          'x-supabase-auth': 'token',
          'user-agent': 'Mozilla/5.0',
        },
      } as Event['request'],
    });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    const h = out.request?.headers as Record<string, string>;
    expect(h.authorization).toBe('[scrubbed]');
    expect(h.Cookie).toBe('[scrubbed]');
    expect(h['x-supabase-auth']).toBe('[scrubbed]');
    expect(h['user-agent']).toBe('Mozilla/5.0');
  });

  it('deletes user.email / user.username / user.ip_address', () => {
    const e = makeEvent({
      user: {
        id: 'u-1',
        email: 'a@b.com',
        username: 'alice',
        ip_address: '1.2.3.4',
      },
    });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    expect(out.user?.email).toBeUndefined();
    expect(out.user?.username).toBeUndefined();
    expect(out.user?.ip_address).toBeUndefined();
  });

  it('replaces user.id with a 12-char HMAC hash that is deterministic per key', () => {
    const e1 = makeEvent({ user: { id: 'user-uuid-1' } });
    const out1 = scrubSentryEvent(e1, { hmacKey: HMAC_KEY });
    const out2 = scrubSentryEvent(makeEvent({ user: { id: 'user-uuid-1' } }), {
      hmacKey: HMAC_KEY,
    });
    expect(out1.user?.id).toHaveLength(12);
    expect(out1.user?.id).not.toBe('user-uuid-1');
    expect(out1.user?.id).toBe(out2.user?.id);
  });

  it('produces different hashes for the same user.id with different keys', () => {
    const e = makeEvent({ user: { id: 'user-uuid-1' } });
    const a = scrubSentryEvent(e, { hmacKey: 'key-a' });
    const b = scrubSentryEvent(makeEvent({ user: { id: 'user-uuid-1' } }), { hmacKey: 'key-b' });
    expect(a.user?.id).not.toBe(b.user?.id);
  });

  it('recursively scrubs emails from event.extra at depth 3', () => {
    const e = makeEvent({
      extra: {
        depth1: {
          depth2: {
            depth3: { studentEmail: 'a@b.com' },
          },
        },
      },
    });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    const extra = out.extra as Record<string, unknown>;
    const d1 = extra.depth1 as Record<string, unknown>;
    const d2 = d1.depth2 as Record<string, unknown>;
    const d3 = d2.depth3 as Record<string, unknown>;
    expect(d3.studentEmail).toBe('[scrubbed-email]');
  });

  it('scrubs breadcrumb body / requestBody / responseBody', () => {
    const e = makeEvent({
      breadcrumbs: [
        {
          category: 'fetch',
          data: { body: 'answer=42', requestBody: 'a@b.com', responseBody: '{"x":1}' },
        },
      ],
    });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    const bc = out.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(bc.body).toBe('[scrubbed]');
    expect(bc.requestBody).toBe('[scrubbed]');
    expect(bc.responseBody).toBe('[scrubbed]');
  });

  it('recursively scrubs emails in breadcrumb data (non-body keys)', () => {
    const e = makeEvent({
      breadcrumbs: [{ category: 'fetch', data: { extraField: 'a@b.com' } }],
    });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    const bc = out.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(bc.extraField).toBe('[scrubbed-email]');
  });

  it('does not throw on a malformed event with non-object request', () => {
    const e = makeEvent({ request: 'not-an-object' as unknown as Event['request'] });
    expect(() => scrubSentryEvent(e, { hmacKey: HMAC_KEY })).not.toThrow();
  });

  it('property test: no email-regex match survives anywhere in output JSON', () => {
    const random = {
      a: 'first.last@example.edu',
      b: { c: 'nested student.id@piercecollege.edu in deeper field' },
      d: ['array', 'of', 'mixed', 'edge@case.com'],
    };
    const e = makeEvent({ extra: random });
    const out = scrubSentryEvent(e, { hmacKey: HMAC_KEY });
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});
```

- [ ] **Step 2: Run tests — expect failure (module not found)**

Run: `npx vitest run lib/observability/scrub.test.ts`
Expected: FAIL — `Cannot find module './scrub'`.

- [ ] **Step 3: Implement the scrub module**

Create `lib/observability/scrub.ts`:

```ts
import crypto from 'node:crypto';
import type { Event } from '@sentry/nextjs';

export type ScrubOptions = {
  hmacKey: string;
};

const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const SCRUB_HEADER_KEYS = /^(authorization|cookie|x-supabase-.*)$/i;
const BODY_KEYS = new Set(['body', 'requestBody', 'responseBody']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hmac12(value: string, key: string): string {
  return crypto.createHmac('sha256', key).update(value).digest('hex').slice(0, 12);
}

function scrubRecursive(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return EMAIL_REGEX.test(value) ? '[scrubbed-email]' : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    return value.map((v) => scrubRecursive(v, seen));
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = scrubRecursive(v, seen);
    }
    return out;
  }
  return value;
}

function scrubRequestHeaders(headers: unknown): unknown {
  if (!isPlainObject(headers)) return headers;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SCRUB_HEADER_KEYS.test(k) ? '[scrubbed]' : v;
  }
  return out;
}

function scrubBreadcrumbData(data: unknown, seen: WeakSet<object>): unknown {
  if (!isPlainObject(data)) return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (BODY_KEYS.has(k)) {
      out[k] = '[scrubbed]';
    } else {
      out[k] = scrubRecursive(v, seen);
    }
  }
  return out;
}

export function scrubSentryEvent(event: Event, opts: ScrubOptions): Event {
  const seen = new WeakSet<object>();
  const out: Event = { ...event };

  if (isPlainObject(event.request)) {
    const req = event.request as Record<string, unknown>;
    const newReq: Record<string, unknown> = { ...req };
    if ('data' in newReq) newReq.data = '[scrubbed]';
    if ('query_string' in newReq) newReq.query_string = '[scrubbed]';
    if ('cookies' in newReq) delete newReq.cookies;
    if ('headers' in newReq) newReq.headers = scrubRequestHeaders(newReq.headers);
    out.request = newReq as Event['request'];
  }

  if (event.user) {
    const u: Record<string, unknown> = { ...event.user };
    delete u.email;
    delete u.username;
    delete u.ip_address;
    if (typeof u.id === 'string' && u.id.length > 0) {
      u.id = hmac12(u.id, opts.hmacKey);
    }
    out.user = u as Event['user'];
  }

  if (event.extra) {
    out.extra = scrubRecursive(event.extra, seen) as Event['extra'];
  }

  if (event.contexts) {
    out.contexts = scrubRecursive(event.contexts, seen) as Event['contexts'];
  }

  if (Array.isArray(event.breadcrumbs)) {
    out.breadcrumbs = event.breadcrumbs.map((bc) => ({
      ...bc,
      data: scrubBreadcrumbData(bc.data, seen),
    })) as Event['breadcrumbs'];
  }

  return out;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run lib/observability/scrub.test.ts`
Expected: PASS — all 13 tests green.

- [ ] **Step 5: Run coverage gate**

Run: `npx vitest run lib/observability/scrub.test.ts --coverage`
Expected: `lib/observability/scrub.ts` shows 100% line and 100% branch coverage. If any branch is uncovered, add a test (most likely candidates: the `isPlainObject` rejection branch, the `seen` cycle branch).

- [ ] **Step 6: Commit**

```bash
git add lib/observability/scrub.ts lib/observability/scrub.test.ts
git commit -m "feat(observability): add strict PII scrub module for Sentry events"
git push
```

---

## Task 20: Vercel Marketplace Sentry integration + SCRUB_HMAC_KEY env var

**Files:**

- Modify: `.env.example`

- [ ] **Step 1: Install the Sentry integration via Vercel Marketplace**

In the Vercel dashboard → BodhiLite project → Integrations → Browse Marketplace → search "Sentry" → "Add Integration".

Follow the prompts:

- Authorize Sentry (creates a Sentry org if you don't have one).
- Select the Sentry organization + project (create new project named "bodhilite-prod" if needed; platform: Next.js).
- Apply the integration to all Vercel environments (Production, Preview, Development).

Vercel auto-injects these env vars across all environments:

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `NEXT_PUBLIC_SENTRY_DSN`

Capture the DSN from the Sentry project's Settings → Client Keys (DSN) page — you'll also see it in Vercel under the Project → Settings → Environment Variables list.

- [ ] **Step 2: Add SCRUB_HMAC_KEY to Vercel manually**

In Vercel → Project Settings → Environment Variables → Add new:

- Name: `SCRUB_HMAC_KEY`
- Value: a randomly generated 32-byte hex string. Generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Environments: Production, Preview, Development (use the same value across; rotation is a future task).

Save the generated value in 1Password under "BodhiLite — SCRUB_HMAC_KEY" so it can be re-pulled for local development.

- [ ] **Step 3: Add env-var documentation to `.env.example`**

Modify `.env.example` (append a Sentry section):

```env

# --- Sentry (Plan 4) ---
# Public DSN — captured automatically by the Vercel Marketplace Sentry integration.
# For local dev, copy the value from Vercel.
NEXT_PUBLIC_SENTRY_DSN=

# Server-side DSN — same as above for now; if Sentry ever supports a separate
# server DSN this is where it goes.
SENTRY_DSN=

# Build-time auth token (for source-map upload). Injected by Vercel; local dev
# does not need it unless you want preview-build source maps to upload.
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# HMAC key used to hash user.id in Sentry events. Rotate yearly.
# Generate locally: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SCRUB_HMAC_KEY=

# Set to "on" only during pre-launch Sentry-canary verification. MUST be absent in
# production. See app/api/__sentry-canary/route.ts.
CANARY_FLAG=
```

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore(env): document Sentry + SCRUB_HMAC_KEY env vars"
git push
```

---

## Task 21: Sentry config files + instrumentation.ts

**Files:**

- Create: `sentry.server.config.ts`
- Create: `sentry.client.config.ts`
- Create: `sentry.edge.config.ts`
- Create: `instrumentation.ts`

- [ ] **Step 1: Write the server config**

Create `sentry.server.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/scrub';

const HMAC_KEY = process.env.SCRUB_HMAC_KEY ?? '';

if (!HMAC_KEY && process.env.VERCEL_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error('Sentry: SCRUB_HMAC_KEY is not set in production — user.id hashing is reversible');
}

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  beforeSend(event) {
    try {
      return scrubSentryEvent(event, { hmacKey: HMAC_KEY });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Sentry scrub failed; dropping event', err);
      return null;
    }
  },
});
```

- [ ] **Step 2: Write the client config**

Create `sentry.client.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/scrub';

const HMAC_KEY = process.env.NEXT_PUBLIC_SCRUB_HMAC_KEY ?? '';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  beforeSend(event) {
    try {
      return scrubSentryEvent(event, { hmacKey: HMAC_KEY });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Sentry scrub failed; dropping event', err);
      return null;
    }
  },
});
```

**Note on client-side HMAC key:** `SCRUB_HMAC_KEY` is server-only (we don't want it in the client bundle, since exposing it lets an attacker reverse the user.id hash). For client-side events, `user.id` is rarely populated (we don't call `Sentry.setUser({ id })` in the browser). If we ever do, add a separate `NEXT_PUBLIC_SCRUB_HMAC_KEY` rotated independently. For Wave 1, leaving the client HMAC key empty is acceptable — the scrub still strips emails / cookies / bodies; only the user.id hash becomes trivially reversible (and is rarely set in browser events).

- [ ] **Step 3: Write the edge config**

Create `sentry.edge.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/scrub';

const HMAC_KEY = process.env.SCRUB_HMAC_KEY ?? '';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  beforeSend(event) {
    try {
      return scrubSentryEvent(event, { hmacKey: HMAC_KEY });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Sentry scrub failed; dropping event', err);
      return null;
    }
  },
});
```

- [ ] **Step 4: Write instrumentation.ts**

Create `instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(...args: Parameters<typeof captureRequestError>) {
  const { captureRequestError } = await import('@sentry/nextjs');
  return captureRequestError(...args);
}

declare const captureRequestError: (
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) => ReturnType<typeof import('@sentry/nextjs').captureRequestError>;
```

(The `declare const` is a TypeScript workaround for the forward reference in the type position. If TypeScript complains, simplify to a direct import inside the function.)

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: clean. If errors, simplify `instrumentation.ts`'s `onRequestError` to:

```ts
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
  },
) {
  const Sentry = await import('@sentry/nextjs');
  return Sentry.captureRequestError(err, request, context);
}
```

- [ ] **Step 6: Run tests to confirm nothing regressed**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add sentry.server.config.ts sentry.client.config.ts sentry.edge.config.ts instrumentation.ts
git commit -m "feat(observability): add Sentry configs + instrumentation hook"
git push
```

---

## Task 22: Wrap `next.config.ts` with `withSentryConfig`

**Files:**

- Modify: `next.config.ts`

- [ ] **Step 1: Read the existing next.config.ts**

Run: `cat next.config.ts`
Note the existing config — typedRoutes, experimental options, etc.

- [ ] **Step 2: Wrap with withSentryConfig**

Replace `export default <config>;` at the bottom of `next.config.ts` with:

```ts
import { withSentryConfig } from '@sentry/nextjs';

// ... existing config object stays the same ...

export default withSentryConfig(nextConfig, {
  // Auto-injected by the Vercel Marketplace Sentry integration:
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps even on Vercel preview builds.
  silent: !process.env.CI,

  // Hide source-map upload from non-CI local builds to keep dev quiet.
  disableLogger: true,

  // We don't use the tunnel route in Wave 1.
  tunnelRoute: undefined,
});
```

If the existing config doesn't use a named `nextConfig` binding, rename it first:

```ts
const nextConfig: NextConfig = {
  // existing options
};
```

- [ ] **Step 3: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Run build to verify no runtime config error**

Run: `npm run build`
Expected: build completes. Warnings about Sentry source-map upload skipped in non-CI are fine.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts
git commit -m "feat(observability): wrap next.config with withSentryConfig"
git push
```

---

## Task 23: Canary route `app/api/__sentry-canary/route.ts`

**Files:**

- Create: `app/api/__sentry-canary/route.ts`

- [ ] **Step 1: Write the canary route**

Create `app/api/__sentry-canary/route.ts`:

```ts
import { requireInstructor } from '@/lib/auth/require';

/**
 * Sentry PII-scrub canary. Throws an error with deliberately PII-stuffed payload
 * to verify that the scrub module strips emails / bodies / user.id before upload.
 *
 * Gated by CANARY_FLAG=on. MUST be unset in production (verified in T24).
 * Instructor-only.
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env.CANARY_FLAG !== 'on') {
    return new Response('Not found', { status: 404 });
  }
  await requireInstructor();

  // Hand-crafted payload designed to exercise every scrub rule:
  // - email in URL query (request.query_string)
  // - email in body (request.data)
  // - email in extras
  // - user.id present (so HMAC hashing fires)
  // - auth header present
  // Sentry's instrumentation captures the request automatically; we add extra
  // PII-shaped fields via Sentry.captureException(..., { extra: {...} }) inline.
  const Sentry = await import('@sentry/nextjs');
  Sentry.setUser({ id: 'canary-user-uuid-xxxx', email: 'canary@example.com' });
  Sentry.captureException(new Error('Sentry canary — verify no PII leaks'), {
    extra: {
      studentEmail: 'student@example.com',
      nested: { deep: { reallyDeep: 'another@example.org' } },
      bodyEcho: 'answer=42&secret=abc',
    },
  });

  return new Response(JSON.stringify({ ok: true, message: 'Canary error captured.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/__sentry-canary/route.ts
git commit -m "feat(observability): add Sentry PII-scrub canary route (gated by CANARY_FLAG)"
git push
```

---

## Task 24: Fire canary on Vercel preview + verify scrub in Sentry dashboard

**Files:**

- No code changes. Manual verification.

- [ ] **Step 1: Set CANARY_FLAG=on temporarily in the Preview environment**

In Vercel → Project Settings → Environment Variables:

- Find `CANARY_FLAG` (added in T20 .env.example pass; if not yet in Vercel, add it)
- Set value: `on`
- Environments: **Preview only** (NOT Production)
- Save.

Redeploy the latest preview (Vercel → Deployments → choose latest preview → Redeploy) so the env var picks up.

- [ ] **Step 2: Sign in as instructor on the preview URL**

Open the preview URL (Vercel will print it after deploy). Sign in as an instructor account.

- [ ] **Step 3: Fire the canary**

In the browser console of the signed-in instructor session:

```js
await fetch('/api/__sentry-canary', { method: 'POST' });
```

Expected response: `{ ok: true, message: 'Canary error captured.' }`.

- [ ] **Step 4: Verify the captured event in Sentry**

In Sentry → BodhiLite project → Issues → newest issue ("Sentry canary — verify no PII leaks").

Click the issue → check the event payload:

- **`user.id`** → must be a 12-character hex string (NOT `canary-user-uuid-xxxx`).
- **`user.email`** → must be ABSENT (NOT `canary@example.com`).
- **`extra.studentEmail`** → must be `[scrubbed-email]`.
- **`extra.nested.deep.reallyDeep`** → must be `[scrubbed-email]`.
- **`request.headers.Cookie`** (if present) → must be `[scrubbed]`.
- **`request.query_string`** (if Sentry captured any query) → must be `[scrubbed]` or absent.

If ANY raw email or raw `canary-user-uuid-xxxx` value appears, the scrub has a gap. STOP and debug before proceeding — this is the FERPA gate.

- [ ] **Step 5: Disable the canary in Vercel**

In Vercel Environment Variables: **delete** `CANARY_FLAG` from Preview (or set to empty). Redeploy preview.

Confirm `CANARY_FLAG` is NOT set in Production (it should never have been).

Verify the canary returns 404 in Production by curling it (use the production URL):

```bash
curl -X POST https://bodhilite.vercel.app/api/__sentry-canary
```

Expected: `Not found` (404).

- [ ] **Step 6: No commit needed (manual verification step)**

Move on to T25.

---

## Task 25: `docs/runbooks/restore-drill.md`

**Files:**

- Create: `docs/runbooks/restore-drill.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/restore-drill.md`:

````markdown
# Runbook: Pre-launch restore drill

**Purpose:** Validate the daily backup pipeline end-to-end by restoring the latest
production B2 backup into a fresh Supabase project and verifying it's queryable.

**Frequency:** Once before Wave 1 launch (Jul 5, 2026) as the spec §9 hard gate.
Then quarterly thereafter.

**Owner:** A. Elangovan.

**Time budget:** First run < 60 min. Quarterly re-runs target < 30 min.

---

## Prerequisites

- The `age` private key is accessible (1Password — "BodhiLite age private key" — or paper backup).
- A Supabase account that can create projects (the instructor's account).
- `psql` or the Supabase dashboard SQL editor for the smoke queries.
- Followed `docs/runbooks/restore-from-b2.md` once before, OR willing to read it inline.

---

## Steps

### 1. Pre-flight

- [ ] Confirm B2 has a backup ≤ 24 h old:
  ```bash
  rclone lsf "b2:bodhilite-backups-prod/" | sort | tail -n 1
  ```
````

- [ ] Confirm the age private key opens with a test decrypt (do NOT decrypt the real backup yet):
  ```bash
  echo "test" | age -r <PUBLIC_KEY> | age --decrypt --identity age-bodhilite.key
  ```
  Expected output: `test`.
- [ ] Note the start time (for RTO measurement).

### 2. Insert a marker row into PROD audit_log

In the production Supabase SQL editor, run:

```sql
INSERT INTO audit_log (actor_user_id, action, target_kind, target_id, after)
VALUES (
  '<your-instructor-user-id>',
  'restore_drill_canary',
  'system',
  NULL,
  jsonb_build_object('canary_id', gen_random_uuid())
)
RETURNING (after->>'canary_id') AS canary_id;
```

Copy the returned `canary_id` UUID. This is the "known row" that the restore drill verifies survived the backup → restore cycle.

### 3. Wait for the next scheduled backup OR trigger one manually

Either:

- Wait until the next 09:00 UTC scheduled run, OR
- Manually trigger via GitHub Actions → "Daily backup" → Run workflow.

Confirm the new B2 object exists with `rclone lsf` (Step 1 query, expect a newer timestamp).

### 4. Create a temp Supabase project

In supabase.com:

- New project → name: `bodhilite-restore-test-YYYYMMDD` (use today's date)
- Region: same as production (US East)
- Database password: random; store in 1Password temporarily ("BodhiLite restore drill — temp DB pwd, $(date)")
- Wait for the project to provision (~2 min).

### 5. Restore the backup into the temp project

Follow `docs/runbooks/restore-from-b2.md` steps 1–4 with:

- `TS` = the timestamp of the backup uploaded in Step 3.
- `TARGET_URL` = the temp project's postgres URI (Project Settings → Database → Connection string).

Expected: `pg_restore` completes with N warnings (ownership/ACL skips are normal) and no errors.

### 6. Smoke SQL verification

In the temp project's SQL editor:

```sql
SELECT 'users' AS table, count(*) FROM users
UNION ALL SELECT 'assessments', count(*) FROM assessments
UNION ALL SELECT 'questions',   count(*) FROM questions
UNION ALL SELECT 'attempts',    count(*) FROM attempts
UNION ALL SELECT 'answers',     count(*) FROM answers
UNION ALL SELECT 'audit_log',   count(*) FROM audit_log;
```

- [ ] Counts roughly match the production DB (within ±5 since some rows may have been added between dump and now).

### 7. Known-row assertion

In the temp project, query for the canary UUID from Step 2:

```sql
SELECT count(*) FROM audit_log
WHERE action = 'restore_drill_canary'
  AND after->>'canary_id' = '<paste-canary-uuid-here>';
```

- [ ] Result: **exactly 1**. If 0, the restore is incomplete — STOP and escalate.

### 8. Write the drill evidence row to PRODUCTION audit_log

Back in the production Supabase SQL editor:

```sql
INSERT INTO audit_log (actor_user_id, action, target_kind, target_id, after)
VALUES (
  '<your-instructor-user-id>',
  'restore_drill',
  'system',
  NULL,
  jsonb_build_object(
    'drill_id', gen_random_uuid(),
    'completed_at', now(),
    'restored_dump_timestamp', '<the TS used in Step 5>',
    'temp_project_name', 'bodhilite-restore-test-YYYYMMDD',
    'rto_minutes', <end_time - start_time>,
    'ok', true
  )
);
```

### 9. Tear down

- [ ] In supabase.com: delete the temp project.
- [ ] In 1Password: archive the temp DB password note (or delete).
- [ ] Securely delete local copies of the decrypted dump + age private key:
  ```bash
  shred -u restore-*/dump.pgc restore-*/dump.pgc.age age-bodhilite.key 2>/dev/null || true
  rm -rf restore-*
  ```

### 10. Document deviations

If any step required deviation from this runbook (unclear instructions, unexpected
errors, etc.), fix the runbook inline and commit the improvement. Treat each
deviation as a runbook bug.

---

## Failure modes

| Symptom                                          | Action                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Latest B2 backup is corrupted (decrypt fails)    | Try the next-most-recent. If 3 in a row fail, ESCALATE before Wave 1 launch.                        |
| Temp Supabase project hits free-tier quota       | Use the paid scratch project for this drill ($0.25 prorated).                                       |
| RTO exceeds 30 min on first run                  | Document as a finding; not a launch blocker for Wave 1.                                             |
| `pg_restore` errors on schema-mismatch (large N) | Schema drift between prod and dump. Investigate before launch.                                      |
| Known-row assertion returns 0                    | Restore is incomplete OR canary row was inserted AFTER backup. Re-check timing in Step 2 vs Step 3. |

````

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/restore-drill.md
git commit -m "docs(runbooks): add pre-launch restore-drill procedure"
git push
````

---

## Task 26: Pre-launch dry-run rehearsal (produces audit_log evidence row)

**Files:**

- No code changes. Manual operator-side rehearsal.

This task validates the entire backup + restore stack before Wave 1 launch. Schedule
this for at least 24 h AFTER T17 merges (so a scheduled backup has run) and
ideally before Jul 5 for buffer.

- [ ] **Step 1: Confirm prerequisites**

- Backup workflow has run at least once on a schedule (not just `workflow_dispatch`) — verify in github.com → Actions.
- B2 bucket has at least 1 object dated within the last 24 h.
- The `age` private key is locatable in 1Password.

- [ ] **Step 2: Execute the full restore-drill runbook**

Follow `docs/runbooks/restore-drill.md` end-to-end. Time each step; note RTO.

- [ ] **Step 3: Confirm the `restore_drill` audit_log row exists in PRODUCTION**

In production Supabase SQL editor:

```sql
SELECT after->>'drill_id' AS drill_id,
       after->>'completed_at' AS completed_at,
       after->>'rto_minutes' AS rto_minutes,
       after->>'ok' AS ok
FROM audit_log
WHERE action = 'restore_drill'
ORDER BY at DESC
LIMIT 1;
```

Expected: 1 row with `ok = true` and a sensible RTO.

- [ ] **Step 4: Update the runbook with any deviations found**

If any step in the runbook was ambiguous or wrong, fix it inline.

- [ ] **Step 5: Commit any runbook fixes**

```bash
git add docs/runbooks/
git commit -m "docs(runbooks): update restore-drill after first dry-run rehearsal"
git push
```

If no fixes needed, no commit. Move on.

---

## Task 27: Append Plan 4 section to `docs/runbooks/nvda-test-script.md`

**Files:**

- Modify: `docs/runbooks/nvda-test-script.md`

- [ ] **Step 1: Append the Plan 4 critical-path section**

Append to `docs/runbooks/nvda-test-script.md`:

```markdown
## Plan 4 — CSV download button critical path

Required before merging Plan 4 to main.

### Setup

1. Sign in as an instructor.
2. Navigate to any published assessment's gradebook page (`/assessments/<id>/attempts`).

### Test steps

1. Press `Tab` until focus reaches the "Download CSV" button.
   - **NVDA should announce:** "Download gradebook CSV for <assessment title>, button"
2. Press `Space` (or `Enter`) to activate the button.
   - **NVDA should announce:** the spinner status — "Preparing download…" via the
     `aria-live="polite"` region.
   - The browser's download notification fires; the file is saved.
3. After the download completes:
   - **NVDA should announce** the button label has returned (no longer spinner).

### Pass criteria

- All three NVDA announcements match the expectations above.
- The download is triggered correctly.
- No focus is lost during the operation.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/nvda-test-script.md
git commit -m "docs(runbooks): add Plan 4 NVDA test for CSV download button"
git push
```

---

## Task 28: Full local test run + verify CI green on PR HEAD

**Files:**

- No code changes.

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 2: Run format check**

Run: `npm run format:check`
Expected: clean. If not, run `npm run format` and amend the last commit (or commit the formatting fix separately).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Run vitest (unit + component + integration)**

Run: `npm test`
Expected: all tests green. Baseline at Plan 3 merge was 174/174; Plan 4 adds ~25 vitest tests (csv: 13, scrub: 13, route: 5, button: 4) for a target of ~209/209.

If the count is short, some Plan 4 tests may not be discovered — check vitest config / file naming.

- [ ] **Step 5: Run Playwright E2E + RLS + a11y suites**

Ensure Supabase local stack is running and env vars are set, then:

```bash
npm run e2e
```

Expected: all green. Plan 4 adds 3 specs (csv-export E2E, csv-export-rls, gradebook-csv-button a11y).

- [ ] **Step 6: Verify CI green on the PR**

Open the draft PR in GitHub. Both `ci.yml` and `e2e.yml` workflows should be green on the latest commit.

If CI fails but local passes, common causes:

- Missing env var in GitHub Actions secrets (re-check T15).
- Local Supabase migration state differs from CI fresh `db reset` (re-check migrations are ordered + idempotent).
- Prettier disagrees with VS Code's auto-format on Windows line endings (check `.gitattributes` if present).

Fix and push until CI is green.

- [ ] **Step 7: Mark PR ready for review**

In GitHub: convert the draft PR to "Ready for review".

```bash
gh pr ready
```

---

## Task 29: Plan 4 success-criteria walkthrough + ready-for-review

**Files:**

- No code changes. Walkthrough only.

Walk through the spec's success criteria one by one. Confirm each is verifiable.

- [ ] **Success criterion 1:** An instructor can download a Canvas-import CSV for any published assessment in < 5 sec from the gradebook page.
  - [ ] Local manual test: signed in as instructor, click Download on a gradebook page, file lands in < 5 sec.
  - [ ] E2E spec covers this path (`tests/e2e/csv-export.spec.ts`).

- [ ] **Success criterion 2:** Canvas accepts the CSV import on first try.
  - [ ] Open the downloaded CSV in Canvas's "Gradebook Import" UI. Run a test import (against a test Canvas course or use Canvas's "Preview" mode if available).
  - [ ] Confirm: no column re-mapping required; students match by SIS Login ID = email.
  - [ ] **If Canvas rejects:** Pierce email may differ from Canvas Login ID convention. Document the mismatch and adjust the CSV format in a follow-up commit. See spec §7 risk #5.

- [ ] **Success criterion 3:** A pg_dump runs daily at 09:00 UTC and lands in B2 encrypted.
  - [ ] github.com → Actions → "Daily backup" — most recent scheduled run succeeded.
  - [ ] B2 bucket has at least 2 dated objects (verifies cron ran).
  - [ ] Spot-check an object: download + decrypt + `pg_restore --list` shows expected tables.

- [ ] **Success criterion 4:** Backup is restorable in < 30 min by following the runbook.
  - [ ] T26 dry run produced a `restore_drill` audit_log row with `ok = true`.
  - [ ] RTO measured was < 30 min (or documented if longer).

- [ ] **Success criterion 5:** Sentry receives one test error from production with zero PII.
  - [ ] T24 canary fired on Preview; verified no PII in captured event.
  - [ ] (Optional) Fire once on Production by temporarily setting CANARY_FLAG=on, then immediately remove. Skip if T24 preview verification was thorough.

- [ ] **Success criterion 6:** Pre-launch restore drill is rehearsed and logged.
  - [ ] T26 produced the `restore_drill` audit_log row.

- [ ] **Final test totals:** Plan 4 adds (target):
  - ~25 vitest tests (csv: 13, scrub: 13, route: 5, button: 4 = 35, but some overlap)
  - 1 E2E spec
  - 1 RLS spec
  - 1 a11y spec
  - 1 NVDA section

- [ ] **Pre-launch checklist for the user:**
  - [ ] Pierce IT/admin notification sent by Jun 1 (spec §12, line 436 carry).
  - [ ] Paper backup of age private key is in a physical safe.
  - [ ] 1Password has all credentials: age private key, B2 application key, SCRUB_HMAC_KEY, temp DB passwords from drills.
  - [ ] Jul 5 final restore drill scheduled on calendar.

- [ ] **When all green: request merge**

Comment on the PR: "Plan 4 complete. All 6 success criteria verified. Ready to squash-merge."

After merge: update `~/.claude/projects/.../memory/project-state.md` with the new commit SHA and the Plan 5 deferred list.

---

_End of Plan 4 implementation plan._
