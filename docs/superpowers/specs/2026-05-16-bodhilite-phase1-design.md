# BodhiLite — Phase 1 (Summer Quiz Tool) Design

**Date:** 2026-05-16
**Author:** A. Elangovan + Claude (brainstorming session)
**Status:** Draft — awaiting user sign-off

---

## 1. Product context

BodhiLite is a learner- and faculty-friendly Learning Management System being built as a Canvas alternative. The full LMS will arrive in Phase 2 (Fall 2026). This spec covers **Phase 1: the standalone Summer Quiz Tool** that will run alongside Canvas during a 2026 Summer Session A course (Jul 6 – Aug 27).

Phase 1 exists to (a) prove the keystone differentiator (chem/math parameterized assessments with WYSIWYG render fidelity) on real students before the rest of the LMS is built, and (b) materially improve the assessment experience for the instructor and the ~25 students in that summer section.

### Out-of-scope for Phase 1 (these are Phase 2)

Pages, modules, files, announcements, assignments + submissions + rubrics, discussions, messaging, weighted gradebook, audit-log viewer UI, manual screen-reader QA at full breadth, SSO with Pierce IdP, native mobile apps, SIS/LTI integration. These are Fall 2026 work.

---

## 2. Goals and success criteria

Phase 1 has shipped successfully when, by **Jul 27** (mid-term), all of the following are true:

1. The instructor can author a parameterized chem/math question (including at least one structure-aware item) in **under 15 minutes**, without leaving BodhiLite.
2. Every summer student has taken at least one parameterized quiz with their own materialized variables, received auto-graded results, and seen them in the per-assessment gradebook — with **zero render-fidelity bugs** between author preview and student view.
3. axe-core CI passes on every PR; the critical-path manual NVDA test (log in → take quiz → see grade) passes.
4. The instructor has exported grades as CSV at least once and re-imported them into Canvas in under 5 minutes per assessment.
5. Zero FERPA incidents. Backup recoverability has been demonstrated at least once in a restore-drill rehearsal **before** Wave 1 opens.
6. By Jul 27 the system supports Exam mode (server-authoritative timer, auto-submit) reliably enough to run the final exam in BodhiLite — OR the documented fallback (run final in Canvas) has been activated by Jul 22 if Wave 3 is at risk.

### Non-goals

- Feature parity with Canvas
- College-wide deployment
- Multi-tenant SaaS
- Anything not on the wave plan in §11

---

## 3. Users and roles

Two roles in Phase 1:

| Role                      | Capabilities                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Instructor** (the user) | Author and publish assessments; view and grade attempts; manage accommodations; export gradebook; admin view of audit log via SQL |
| **Student**               | Authenticate via magic link; take published assessments; see own attempts and grades only                                         |

A future "TA" role and a "system administrator" role are anticipated for Phase 2 but not built in Phase 1.

---

## 4. Hard constraints

These are non-negotiable. Every design choice must respect them.

### 4.1 FERPA compliance

All student-identifying data (name, email, attempt responses, grades, accommodations, snapshots) is treated as protected. Specific commitments:

- **No FERPA data crosses to third parties** outside the approved list (Vercel hosting, Supabase data layer, transactional-email provider for magic links, error monitoring with PII scrubbing).
- **Postgres row-level security** enforces per-user access at the database. App-layer bugs cannot leak data through the DB.
- **RLS coverage is tested in CI.** Every FERPA table has a Playwright test that logs in as student A and asserts that student-B-scoped queries return zero rows.
- **No analytics SDKs** that send identifiable events to third parties. Vercel Web Analytics (privacy-first, no cookies, no PII) or self-hosted PostHog only.
- **Logs scrub student identifiers** by default. Verbose logging is opt-in with an audit-log entry of who turned it on, when, why, and for how long.
- **No student-authored content** is sent to LLM providers in Phase 1. Future LLM features touching student work require an explicit consent flow and DPA review.

### 4.2 WCAG 2.2 AA conformance

Every shipped UI surface (instructor and student) meets WCAG 2.2 AA at minimum.

- **Component baseline:** shadcn/ui (Radix primitives) plus a curated subset of Reka UI. Accessible-by-default — keyboard nav, focus management, ARIA roles, visible focus indicators.
- **Automated testing per PR:** axe-core via `@axe-core/playwright` against a fixed route set (instructor dashboard, assessment list, authoring, exam attempt, gradebook); build fails on any axe violation ≥ serious severity. Color contrast locked at 4.5:1+ via Tailwind config. Keyboard-only completion of critical flows tested via Playwright.
- **Manual testing before each Wave:** NVDA on Windows + VoiceOver on macOS pass through the critical paths. Scripted, time-boxed (~90 minutes), runbook captured for repeatability. Zoom-to-200% pass. `prefers-reduced-motion` respected.
- **Math accessibility:** KaTeX with `output: 'mathml'` (plus visual rendering) so screen readers read math correctly. No SVG-only math.
- **Chem accessibility:** Ketcher-drawn structures get `aria-label` with IUPAC name (where computable) and SMILES. For students who can't use the drawing widget (screen reader, motor disability), the `assessment_overrides.alternative_format = 'typed-smiles'` path swaps Ketcher for a SMILES text input. Same grading logic.
- **Known accessibility gap:** "identify the functional group on this displayed structure" — intrinsically visual. Manual workaround: instructor offers an oral or written-description alternative assessment. Documented in v1.5 backlog.
- **Mobile/responsive:** critical flows must work on iPhone Safari and Android Chrome at standard sizes; target sizes meet WCAG 2.5.8.

### 4.3 Accommodations

A per-student override mechanism is first-class. Stored as `assessment_overrides` rows with: `extra_time_seconds`, `extra_attempts`, `available_until_override`, `alternative_format`, `reason`, plus actor + timestamp + audit-log reference. Granting is invisible to other students. Phase 1 has DB-tool grants for Wave 1; full UI lands in Wave 3 (by Jul 20, before the final exam).

### 4.4 Render fidelity

The instructor preview pane and the student attempt view are produced by the same renderer module, called with different seeds. There is **one rendering pipeline**, not two. This is enforced by code review and by a test that hashes both outputs and asserts byte-equality for fixed-seed cases.

---

## 5. System architecture

### 5.1 Stack

| Layer                                             | Choice                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| App framework                                     | Next.js 15 App Router on Vercel (Fluid Compute, Node.js 24 LTS)                                                                       |
| UI components                                     | shadcn/ui (Radix) + Tailwind CSS                                                                                                      |
| Math rendering                                    | KaTeX with MathML output                                                                                                              |
| Chem drawing                                      | Ketcher (EPAM, MIT license)                                                                                                           |
| Chem grading (client preview)                     | RDKit-WASM                                                                                                                            |
| Chem grading (server, source of truth)            | RDKit Python in a Vercel Function (Python 3.13/3.14 via Fluid Compute)                                                                |
| Database                                          | Supabase Postgres, US East region                                                                                                     |
| Auth                                              | Supabase Auth, magic-link email                                                                                                       |
| Storage                                           | Supabase Storage, private buckets, signed URLs                                                                                        |
| Per-row access control                            | Postgres RLS                                                                                                                          |
| Sandboxed expression evaluator (grading formulas) | `asteval` (server-side Python) for formula grading                                                                                    |
| Source + CI                                       | GitHub + Vercel preview deployments; axe-core, Playwright a11y tests, TypeScript check, RLS coverage test per PR                      |
| Backups                                           | Supabase managed PITR (7-day) + daily `pg_dump` via GitHub Action → Cloudflare R2 (S3-compatible, zero egress fees), 30-day retention |
| Error monitoring                                  | Sentry with PII scrubbing (response bodies and email addresses are never sent)                                                        |
| Analytics                                         | Vercel Web Analytics (privacy-first, no cookies, no PII)                                                                              |

### 5.2 Why this stack (the short version)

- **Next.js + Vercel** is the cleanest path for shipping the chem/math frontend (Ketcher, RDKit-WASM, KaTeX all live in the JS ecosystem) with low cold-start latency for quiz submissions (Fluid Compute).
- **Supabase** is batteries-included (auth + storage + RLS + dashboard) — a meaningful time saving over piecing together Neon + Clerk + S3 in 7 weeks at 5-10 hrs/wk user availability.
- **RDKit** lives on both client (live preview, WASM) and server (grading-of-record, Python). The Python server side is the canonical version; client-side is for UX feel only.
- Migrating Postgres to Neon or self-hosted later is a few-week project if Pierce adopts; the auth/storage layers are the lock-in, and we'll keep their abstractions thin.

### 5.3 Repository structure (proposed)

```
bodhilite/
  app/                       Next.js App Router
    (auth)/                  magic-link flow
    (instructor)/            authoring, gradebook, accommodations
    (student)/               attempt UI, grade view
    api/                     route handlers (mostly server actions instead)
  components/                shadcn/ui-derived components
  lib/
    rendering/               THE single rendering pipeline (called by both preview and attempt)
    materializer/            variable spec → materialized values from seed
    grading/                 formula evaluator + chem graders (JS shims to Python service)
    supabase/                client + server + RLS helpers
  python/
    rdkit_service/           Vercel Python Function — chem grading, formula eval
  supabase/
    migrations/              SQL migrations
    policies/                RLS policy SQL (one file per table)
    tests/                   RLS coverage tests (pgTAP or Playwright-driven)
  tests/
    a11y/                    axe-core + Playwright a11y suites
    rls/                     RLS coverage (Playwright login-as-X)
    integration/             full attempt-to-grade flow tests
  docs/
    superpowers/specs/       this spec lives here
    runbooks/                restore drill, incident response, NVDA test script
  .github/workflows/         CI: axe, RLS, TS, restore-drill rehearsal monthly
```

---

## 6. Data model

### 6.1 Entities (Phase 1)

```
users                  (id, email, role, created_at)
assessments            (id, owner_user_id, title, slug, status,
                        assessment_type,             -- 'quiz' | 'exam'
                        time_limit_seconds,           -- NULL for quiz, required for exam
                        randomize_questions BOOL,
                        randomize_choices BOOL,
                        default_attempts INT,
                        opens_at, closes_at,
                        settings JSONB,
                        created_at, updated_at)
questions              (id, assessment_id, position, type, body JSONB, scoring JSONB)
question_variables     (id, question_id, name, spec JSONB)
attempts               (id, assessment_id, student_user_id, attempt_no,
                        seed BIGINT, started_at, submitted_at,
                        expires_at,                   -- NULL for quiz; set on start for exam
                        status,
                        created_at)
answers                (id, attempt_id, question_id,
                        rendered_question_snapshot JSONB,  -- source of truth for grading
                        response JSONB,
                        auto_score NUMERIC, manual_score NUMERIC,
                        score_method TEXT,
                        graded_at TIMESTAMPTZ,
                        created_at, updated_at)
media                  (id, owner_user_id, mime, storage_path,
                        alt_text, attached_to_kind, attached_to_id,
                        created_at)
assessment_overrides   (id, student_user_id, assessment_id,
                        extra_time_seconds INT,
                        extra_attempts INT,
                        available_until_override TIMESTAMPTZ,
                        alternative_format TEXT,      -- e.g. 'typed-smiles'
                        reason TEXT,
                        granted_by_user_id, granted_at,
                        audit_log_id)
audit_log              (id, actor_user_id, action, target_kind, target_id,
                        before JSONB, after JSONB, at TIMESTAMPTZ)
```

### 6.2 Critical design properties

1. **`answers.rendered_question_snapshot` is the source of truth for grading.** Question templates can be edited after a student attempts; their snapshot stays fixed. Re-renders for dispute review use the snapshot, not the current template.
2. **`attempts.seed` is deterministic.** `seed = stable_hash(student_id || assessment_id || attempt_no)`. Same student, same attempt → same materialized variables. No "the system gave me different numbers this time" bugs.
3. **Auto-grading runs server-side against the snapshot + response.** Client-side RDKit is for live preview only. Grading-of-record can't be tampered with from the client.
4. **RLS policies enforce FERPA at the DB.** Tested in CI on every PR.
5. **`answers.rendered_question_snapshot` is write-once.** RLS policy blocks UPDATE once the column is non-NULL.
6. **`audit_log` is append-only.** No UPDATE, no DELETE policies. 7-year retention (standard educational records floor).

### 6.3 RLS policy pattern

```sql
-- Students see only their own submission data
CREATE POLICY answers_student_select ON answers
  FOR SELECT
  USING (
    (SELECT auth.uid()) IN (
      SELECT student_user_id FROM attempts WHERE attempts.id = answers.attempt_id
    )
  );

-- Instructors see all rows for assessments they own
CREATE POLICY answers_instructor_select ON answers
  FOR SELECT
  USING (
    (SELECT auth.uid()) IN (
      SELECT a.owner_user_id
      FROM attempts att JOIN assessments a ON a.id = att.assessment_id
      WHERE att.id = answers.attempt_id
    )
  );

-- Snapshot is write-once
CREATE POLICY answers_snapshot_immutable ON answers
  FOR UPDATE
  USING (rendered_question_snapshot IS NULL)
  WITH CHECK (rendered_question_snapshot IS NULL
              OR rendered_question_snapshot = OLD.rendered_question_snapshot);
```

Every FERPA-bearing table has analogous policies.

---

## 7. Rendering pipeline (the keystone)

### 7.1 The single function

```ts
question_renderer({ template, variable_spec, seed }) → {
  materialized_values,    // e.g. { compound: "CaCO₃", mass: 140 }
  rendered_html,          // exact HTML bytes (math as MathML, chem as Ketcher SVG)
  grading_target          // e.g. { target: 1.3987, tolerance: 0.005 }
}
```

Called from exactly **two** sites:

1. **Author preview pane** — with `seed = 0` (or a user-typed "preview as student #N" seed).
2. **Student attempt view** — with `seed = stable_hash(student_id || assessment_id || attempt_no)`.

No other code path renders a question. Enforced by code review and by an integration test that imports the renderer and asserts both call-sites use it.

### 7.2 Snapshot capture

On a student's first view of a question in an attempt:

1. Server checks `answers.rendered_question_snapshot` — if non-NULL, returns the existing snapshot (idempotent).
2. If NULL, server calls `question_renderer(...)` with the attempt's seed.
3. Result written atomically to `answers.rendered_question_snapshot`. Write-once enforced by RLS.

All subsequent operations on this question for this student (re-display, grading, dispute review) work against the snapshot. The template can be edited freely afterwards without affecting any in-flight student attempt.

### 7.3 Per-content-type behavior

| Content type          | Renderer                                           | Accessibility                                                                   |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Plain text + Markdown | Standard MD-to-HTML with semantic tags             | Standard semantic HTML                                                          |
| Math                  | KaTeX `output: 'mathml'` + visual SVG              | MathML read by NVDA, JAWS, VoiceOver                                            |
| Chemistry structure   | Ketcher SDK → SVG; SMILES stored alongside         | `aria-label` includes name + SMILES; alternative-format swap for accommodations |
| Pasted image          | Uploaded to Supabase Storage (private, signed URL) | Alt text required to save in Phase 1; VLM-suggested in Phase 2                  |
| Code / preformatted   | `<pre><code>`                                      | Standard; syntax highlighting post-Phase-1                                      |

---

## 8. Quiz engine

### 8.1 Assessment types

| Capability                     | Quiz          | Exam                                 |
| ------------------------------ | ------------- | ------------------------------------ |
| Time limit                     | Not available | Required                             |
| Default attempts               | 3             | 1                                    |
| Default available window       | Open all term | Narrow open/close window             |
| Default question order         | Author's      | Randomized per student               |
| Default choice order (MC/MA)   | Author's      | Randomized per student               |
| Server-authoritative countdown | n/a           | Yes                                  |
| Auto-submit on expiry          | n/a           | Yes, with small network-grace window |

One underlying engine; UI presents them as separate tabs.

### 8.2 Question types (Phase 1)

| Type                            | Author specifies                                                        | Auto-grade method                                          |
| ------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------ | ------------ |
| Multiple choice (single)        | Stem (with `{{vars}}`), choices, correct choice                         | String/index match                                         |
| Multiple answer                 | Stem, choices, correct set                                              | Set match; partial credit configurable                     |
| True/false                      | Stem, truth value                                                       | Bool match                                                 |
| Numeric (with tolerance)        | Stem, grading formula, tolerance                                        | `                                                          | response - formula(vars) | ≤ tolerance` |
| Short answer (regex)            | Stem, regex (with `{{vars}}` substitution)                              | Pattern match, case-insensitive default                    |
| Fill-in-the-blank               | Stem with blanks, target per blank                                      | Per-blank match                                            |
| Chem: draw-to-target            | Stem, target SMILES, mode (exact / substructure / functional-group set) | RDKit canonical SMILES / substructure / detected-group set |
| Chem: pick-the-product          | Stem (reactants), candidate structures, correct ones                    | MC over rendered structures                                |
| Chem: identify-functional-group | Stem (structure), candidate functional groups, present groups           | Set match against RDKit-detected groups                    |

Wave timing: standard objective + parameterized for Wave 1 (Jul 6); chem exact-match for Wave 2 (Jul 13); chem substructure + functional-group for Wave 4 (Aug 1).

Cut from Phase 1 entirely (deferred indefinitely or to v1.5+): mechanism arrow-pushing, free-form synthesis/retrosynthesis grading, reaction-balancing grading, IUPAC-name-to-structure grading, manual essay-style questions (reframed as Phase 2 assignments), per-quiz question-bank randomization, per-student question order within a quiz (exams already have this), lockdown-browser integration, group quizzes.

### 8.3 Variable spec language

Form-based authoring (no JSON, no code). Stored shape:

```json
// Pick-from-list
{ "name": "compound", "type": "choice",
  "spec": { "values": [{"label":"NaCl","smiles":"[Na+].[Cl-]"}, ...], "weights": null } }

// Random integer
{ "name": "mass", "type": "randint",
  "spec": { "min": 10, "max": 200, "step": 5, "unit": "g" } }

// Derived
{ "name": "molar_mass_compound", "type": "derived",
  "spec": { "expression": "molar_mass(compound)" } }
```

Variable types in Phase 1: `choice`, `randint`, `randfloat`, `derived`, `chemistry_compound` (a `choice` whose values carry SMILES).

### 8.4 Grading formulas

Evaluated server-side in `asteval` (or equivalent restricted evaluator). Whitelist:

- Math: `+`, `-`, `*`, `/`, `**`, `sqrt`, `log`, `log10`, `exp`, `abs`, trig functions
- Chemistry helpers: `molar_mass(formula)`, `atomic_number(element)`, `density(compound)`

No imports, no attribute access, no I/O. Formulas referencing missing variables fail validation at authoring time.

### 8.5 Chem grading modes

1. **Exact-structure** (Wave 2): student's SMILES canonicalized; must equal target canonical SMILES. Stereochemistry toggle per question.
2. **Substructure** (Wave 4): RDKit `HasSubstructMatch` against a target SMARTS / SMILES.
3. **Functional-group set** (Wave 4): instructor picks from a curated catalog (~30 common groups); student's structure analyzed; correct iff detected-set equals target-set.

All three run server-side via the RDKit Python Function (canonical) with client-side WASM mirroring for live preview only.

### 8.6 Attempts and exam timer

- Multiple attempts per quiz, configurable (default 3); per-attempt deterministic seed.
- Server-authoritative exam timer: `attempts.expires_at = started_at + (time_limit + per-student extra_time)` set on attempt start. Client renders countdown derived from server time.
- Auto-save on every input blur/change → `answers.response`.
- Submit finalizes attempt; auto-grade runs synchronously (Phase 1 quizzes are small enough).
- On timer expiry: server marks `submitted_at = expires_at + grace`, runs auto-grade against whatever was in `answers.response`. Client also submits if still alive; the server's submit is the authoritative one.

---

## 9. Backup and recovery

| Layer                              | Frequency    | Retention               | Restore RTO target |
| ---------------------------------- | ------------ | ----------------------- | ------------------ |
| Supabase managed PITR              | continuous   | 7 days                  | < 15 min           |
| Daily `pg_dump` → S3-compat bucket | 1×/day       | 30 days                 | < 30 min           |
| Daily Storage bucket snapshot      | 1×/day       | 30 days                 | < 30 min           |
| Pre-migration ad-hoc backup        | event-driven | retained until verified | < 30 min           |

**Restore drill is a hard gate.** Before Wave 1 opens (no later than **Jul 5**): spin up a `bodhilite-restore-test` Supabase project, restore from a daily snapshot, verify a known row is recoverable, tear down. Logged as an event. Quarterly re-runs after that.

---

## 10. Incident response (Phase 1)

| Scenario                             | Response                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Suspected unauthorized FERPA access  | Rotate Supabase service-role key; invalidate sessions; review audit log + Supabase auth logs; notify affected students within 7 days per Pierce policy / state law |
| Data loss                            | Restore from PITR (small loss) or daily snapshot (larger); identify gap; notify affected students; audit-log the restore                                           |
| Exam-time outage                     | Extend exam window via `assessment_overrides`; communicate by Pierce email; if extension impossible, drop the exam from grade calc with announcement               |
| RLS regression in CI                 | Block deploy; investigate; no production exposure                                                                                                                  |
| RLS regression in prod               | Disable affected route immediately; audit-log access since regression; notify per FERPA if confirmed exposure                                                      |
| Wave 3 (exam mode) at risk by Jul 22 | Activate Canvas-fallback for Jul 27 final exam                                                                                                                     |

---

## 11. Build sequence (Phased Wave plan)

Today is **2026-05-16**. User availability is **5-10 hrs/wk** for review, integration questions, and content authoring.

### Wave 1 — Jul 6 (course Day 1)

| Week                      | Deliverable                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 (May 16-22)            | Next.js + Supabase + Vercel scaffold; magic-link auth; data-model migrations; RLS policies + CI coverage; axe-core in CI from day 3; `.gitignore` and CI baseline                                                                           |
| W2 (May 23-29)            | Assessment list/create/edit shell (Quiz vs Exam settings); standard objective question authoring end-to-end                                                                                                                                 |
| W3 (May 30-Jun 5)         | Variable spec UI; server-side materializer with deterministic seeding; sandboxed formula evaluator; preview-as-student seed switcher                                                                                                        |
| W4 (Jun 6-12)             | Student attempt UI with snapshot capture; auto-save; submit; auto-grade for standard + parameterized; basic gradebook view; CSV export to Canvas format                                                                                     |
| W5 (Jun 13-19)            | Daily backup automation; restore-drill rehearsal; Sentry monitoring with PII scrubbing; first end-to-end smoke test; **half-day Ketcher integration spike** (proves the React/App-Router/Server-Component story works before Wave 2 starts) |
| W6 (Jun 20-26)            | Manual NVDA + VoiceOver pass against critical paths; you author your first real summer quiz in BodhiLite; fix what trips you up                                                                                                             |
| W7 partial (Jun 27-Jul 5) | Production smoke test; restore-drill final dry-run; go-live readiness checklist; **gate: ship Mon Jul 6 morning, with Friday Jul 3 as smoke-test in production-preview**                                                                    |

Wave 1 launch features: auth, RLS, data model, standard objective quizzes, parameterized quizzes, snapshot-based render fidelity, basic gradebook + CSV export, FERPA backup + restore drill, WCAG axe-core CI, manual accommodations via DB tool.

### Wave 2 — Jul 13

Chem integration on authoring side (Ketcher); RDKit-WASM client preview; RDKit Python server grader (exact-SMILES mode only); chem question types (draw-to-target exact, pick-the-product).

### Wave 3 — Jul 20

Exam mode: server-authoritative timer, auto-submit on expiry, randomized question order, randomized choice order. Accommodations UI (grant/edit/revoke flow applied at attempt start). This Wave is the highest-stakes one because **Jul 27 is the mid-term exam** — by Jul 22, if Wave 3 is at risk, activate the Canvas-fallback.

### Wave 4 — Aug 1

Chem substructure-match grading (RDKit `HasSubstructMatch`); chem functional-group-set grading (curated catalog of ~30 groups); chem identify-functional-group question type. Lands during Pierce summer Session B; ready for Fall Phase 2 work.

---

## 12. Risks we're knowingly carrying

1. **Wave 1 has zero schedule cushion.** ~7.2 weeks of calendar at 5-10 hrs/wk for ~5 weeks of work × ~1.4× stretch ≈ ~7 weeks. One bad week could push Wave 1 to Jul 8-10. Checkpoint: by Jun 22, if W3 deliverables are not done, we cut more from Wave 1 or slip by one week.
2. **Mid-term feature shipping increases bug risk during class.** Mitigation: every Wave deploys to preview Friday → user smoke-tests over weekend → ship Monday morning. Never ship to production on a weekday afternoon.
3. **Wave 3 exam timer is the highest-stakes feature.** Must work by Jul 20 to give a full week of stress-testing before Jul 27. Fallback: run Jul 27 final in Canvas — fallback decision deadline is Jul 22.
4. **Ketcher integration in Next.js App Router (Wave 2)** is the highest-variance technical task. If it slips, Wave 3 work compresses. Mitigation: half-day Ketcher integration spike during Wave 1 W5 (Jun 17-19) to surface risk before Wave 2 starts.
5. **RDKit Python on Vercel Functions** has packaging risk for native deps. Fallback: small Modal/Fly.io sidecar — adds ops surface but unblocks. Decide by Jul 9 (when the chem grader server-side work begins in Wave 2).
6. **User availability is genuinely tight.** Bandwidth slipping below 5 hrs/wk means Wave 1 cannot ship Jul 6 even with full cuts. Checkpoint: re-assess weekly during W3-W6.

---

## 13. Out-of-scope action items for the instructor

These are not engineering work but they are critical to a successful pilot:

1. **Pierce IT/admin notification** by **Jun 1**. Even a courtesy email — "I'm piloting a non-official LMS for my summer section; here's what data lives where; here's our backup/incident plan; happy to brief if helpful."
2. **Student notification + consent** by **Jul 6 (Day 1 of course)**. Cover: what BodhiLite is, what data it stores, where it's hosted, how to request accommodations, what to do if something breaks, and the explicit option to opt out and stay in Canvas (in which case the instructor accepts the burden of dual-system grading for that student).
3. **Backup plan for grades**. Even with daily DB backups, keep paper or Pierce-email records of any high-stakes grades (final exam especially) during the pilot. Defense-in-depth.

---

## 14. Phase 2 preview (not built in Phase 1)

For situational awareness only — Phase 2 begins Aug 1 - Sep 21 and adds: course homepage / syllabus, modules, pages with rich content (paste-image-with-alt-text, paste-chem-structure), files, announcements, assignments + file/text submissions + rubrics, weighted gradebook, audit-log UI viewer, manual screen-reader QA at full breadth, VLM-suggested alt text, audit log retention policies finalized, and any quiz-engine refinements that the summer pilot surfaces.

The Phase 1 codebase is designed so Phase 2 adds new entities and routes without rewriting the rendering pipeline, the snapshot model, the auth layer, the RLS pattern, or the FERPA/WCAG infrastructure. Phase 2 is additive.

---

_End of Phase 1 design spec._
