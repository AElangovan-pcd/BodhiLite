# BodhiLite — Wave 1 Plan 3 (Student Attempt + Grading) Design

**Date:** 2026-05-26
**Author:** A. Elangovan + Claude (brainstorming session)
**Status:** Draft — awaiting user sign-off before plan-writing
**Parent spec:** [`2026-05-16-bodhilite-phase1-design.md`](2026-05-16-bodhilite-phase1-design.md) (locked)
**Predecessor plans:**

- [`2026-05-16-bodhilite-wave1-foundation.md`](../plans/2026-05-16-bodhilite-wave1-foundation.md) (Plan 1 — merged `eb9e319`)
- [`2026-05-18-bodhilite-wave1-plan2-authoring.md`](../plans/2026-05-18-bodhilite-wave1-plan2-authoring.md) (Plan 2 — merged `694e5c3`)

---

## 0. Scope of this document

Plan 3 is the **Student Attempt + Grading** slice of Wave 1. It builds:

- The student-facing route tree (`/take/[id]` + `/attempts/[aid]` + `/attempts/[aid]/result`).
- The eager-snapshot-at-attempt-start mechanism that captures every question's rendered state + precomputed grading targets into `answers.rendered_question_snapshot`.
- The single auto-grade function that scores each answer purely against `(snapshot, response)`, with no live formula re-evaluation.
- Submit handling (synchronous auto-grade + attempt summary write) via a PL/pgSQL helper.
- Per-question autosave (Server Action, debounced ~500ms on the client).
- The post-submit student result page with correctness badges + correct-answer reveal.
- Multi-attempt mechanics: highest-counts scoring, auto-resume in-progress, fresh per-attempt seed.
- The instructor gradebook UI (per-assessment table + drill-down view of any submitted attempt).

Plan 3 does **not** build CSV export, images/Storage, backup automation, Sentry, or the restore drill — those are Plan 4. It does not build the exam timer, randomization, or accommodations UI — those are Wave 3. It does not build any Ketcher or RDKit integration — that's Wave 2.

This document describes WHAT Plan 3 delivers and HOW the modules fit together. The implementation plan (task breakdown, ordering, atomic-commit boundaries) will be generated separately by the writing-plans skill from this spec.

### Plan boundary (decided during brainstorming)

- **Plan 3 builds:** student route tree, eager snapshot capture, auto-grade dispatch, submit transaction, autosave, result page, multi-attempt + resume, **and the full instructor gradebook UI** (per-assessment table + drill-down).
- **Plan 3 does NOT build:** CSV/Canvas export, image upload, backup automation, Sentry, restore drill, exam timer, randomization, accommodations UI (other than honoring `extra_attempts`), Ketcher, RDKit.
- **Plan 3 reuses from Plan 2:** `renderQuestion`, materializer, `stableSeed`, formula evaluator, per-type body/scoring zod schemas, and the 6 `AnswerSurface` components (lifted to controlled mode).

---

## 1. Decisions locked during brainstorming

These are the design-shaping decisions made before plan-writing. Each is recorded here so the implementation plan can flow from them without re-litigation.

| #   | Decision                                                                                                                                                                                    | Why                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Plan 3 includes the full instructor gradebook UI.** Plan 4 only handles CSV export + Storage/images + ops/backups.                                                                        | Bold scope choice — instructor sees grades inside BodhiLite before the Jul 27 mid-term success criterion, no waiting on Plan 4. Gradebook table = ~3 tasks; small relative to total Plan 3 size.                    |
| D2  | **Single-page-scroll attempt UI.** All questions on one route; snapshots captured eagerly in the start-attempt transaction.                                                                 | Cleanest state model; matches Canvas/Moodle quiz conventions; resume is trivial; doesn't preclude per-page navigation as a Wave 3 polish for exam mode.                                                             |
| D3  | **Highest score counts; auto-resume in-progress.** At most one in-progress attempt per (student, assessment).                                                                               | LMS-standard. Simplest mental model for students. Avoids "which one do I count?" disputes.                                                                                                                          |
| D4  | **Full reveal on result page.** Score + per-question right/wrong + correct answer extracted from the snapshot's scoring. Same view on revisit.                                              | Quizzes are formative (homework-style, 3 attempts); reveal supports the learning loop. Wave 3 exam mode will have a separate, reveal-locked result page.                                                            |
| D5  | **Snapshot stores precomputed grading targets, not just materialized variables.** Numeric target value, regex source (post-substitution), correct choice IDs all baked in at snapshot time. | Grading becomes pure `compare(snapshot, response)`; no formula re-evaluation at grade time; faster + safer for dispute review; failure modes shrink to "is the response parseable" plus "does it match."            |
| D6  | **All writes via Server Actions** (Shape A). `startAttemptAction`, `saveAnswerAction` (debounced ~500ms on client), `submitAttemptAction`.                                                  | Matches Plan 2 pattern; no Route Handler tier needed at Phase 1 volume (~25 students × ~10 questions/quiz); auth gating free via the `(student)` route group.                                                       |
| D7  | **Auto-grade runs synchronously on submit** (spec §8.6 verbatim).                                                                                                                           | Quizzes are small; single transaction is fine; no background-job infra needed; immediate result page; one less moving part.                                                                                         |
| D8  | **Quiz-only in Plan 3.** No timer, no `expires_at` plumbing, no auto-submit on expiry.                                                                                                      | Wave 3 (Jul 20) adds exam mode end-to-end. Plan 3 shipping for Wave 1 doesn't need any timer code; not adding scaffolding now keeps the surface minimal.                                                            |
| D9  | **Reveal-on-result is implicit** (no per-assessment toggle in Plan 3).                                                                                                                      | Matches D4. If the user wants per-assessment control later, it's a Plan 4 polish item — a new `assessments.settings.reveal_correct_answers` enum can be added without schema churn.                                 |
| D10 | **Submit uses a PL/pgSQL helper (`submit_attempt`).** Multi-row atomicity for `UPDATE answers ... + UPDATE attempts ...`.                                                                   | Supabase JS client has no transaction primitive. A SECURITY DEFINER function is the only clean way to keep the submit atomic. Kept simple: takes a pre-computed grades JSONB, writes N answer rows + 1 attempt row. |
| D11 | **`AnswerSurface` components get a controlled mode** via optional `value` + `onChange` props. Uncontrolled fallback preserved.                                                              | Plan 2's preview keeps working unchanged; Plan 3 lifts state to the parent client component. Backwards-compatible refactor — 1 task of focused work.                                                                |
| D12 | **Extract `requireStudent()` / `requireInstructor()` auth helpers.**                                                                                                                        | Action count ≥ 4 across the codebase now; defense-in-depth on Server Actions (called out as a tech-gotcha after Plan 2). Plan 2's existing actions get a one-line refactor; new Plan 3 actions adopt from day one.  |

---

## 2. Routes and navigation

### 2.1 New route trees

```
app/
  (student)/                                  NEW route group
    take/
      [id]/
        page.tsx                              entry: resolve attempt → redirect (or start)
                                              - if in-progress attempt exists → redirect to /attempts/[aid]
                                              - else if attempts remaining → call startAttemptAction
                                                    on success → redirect to /attempts/[aid]
                                                    on failure → render error page (reason from action result)
                                              - else → render "no attempts remaining" with link to best-attempt result
        actions.ts                            startAttemptAction(assessmentId) [Server Action]
    attempts/
      [aid]/
        page.tsx                              attempt page (single-page scroll); in-progress only
                                              - if submitted → redirect to /attempts/[aid]/result
        actions.ts                            saveAnswerAction(attemptId, questionId, response)
                                              submitAttemptAction(attemptId)
        result/
          page.tsx                            post-submit view; submitted-only
                                              - if in-progress → redirect to /attempts/[aid]
  (instructor)/
    assessments/
      [id]/
        attempts/
          page.tsx                            gradebook table for this assessment
          [aid]/
            page.tsx                          drill-down: read-only view of one submitted attempt
                                              (reuses result page component with actor='instructor')
```

### 2.2 Access control

Mirror Plan 2's layout-gate pattern.

| Scenario                                                           | Behavior                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Unauthenticated → any of the above                                 | redirect to `/sign-in`                                             |
| Student → `(student)` routes                                       | render                                                             |
| Instructor → `(student)` routes                                    | render (instructor accounts can also take quizzes — useful for QA) |
| Student → `(instructor)` routes                                    | 404 (FERPA: don't reveal route shape)                              |
| Authenticated student → `/attempts/[aid]` they don't own           | 404 (don't reveal attempt IDs)                                     |
| Authenticated student → submitted `/attempts/[aid]` (no `/result`) | redirect to `/attempts/[aid]/result`                               |
| Authenticated student → in-progress `/attempts/[aid]/result`       | redirect to `/attempts/[aid]`                                      |
| Instructor → `/assessments/[id]/attempts` they don't own           | 404 (RLS enforces — query returns no rows)                         |

### 2.3 Home page extension

`app/page.tsx` (currently links to `/assessments` for instructors only, per Plan 2 Task 30) gains a student-visible "Your assessments" section:

- Queries published assessments within the open/close window. RLS already permits student SELECT on these.
- Each row shows: title, status badge (`Not yet attempted` | `In progress — Resume` | `Best: 8/10`), and a link to `/take/[id]`.
- Empty state: "No assessments available right now."

Instructor accounts see both sections (instructor management link AND the student-visible assessments list, since they can dogfood).

### 2.4 Navigation pattern

No global app header in Plan 3 (matching Plan 2). Per-page breadcrumbs:

- `/take/[id]` is a transient redirect — no breadcrumb.
- `/attempts/[aid]` (in-progress) shows assessment title + attempt number in a sticky header strip; no breadcrumb (intentionally minimal chrome during quiz-taking).
- `/attempts/[aid]/result` shows `← Home` + assessment title.
- `/assessments/[id]/attempts` shows `← {assessment title}` + page title "Attempts".
- `/assessments/[id]/attempts/[aid]` shows `← Attempts` + page title "Attempt N by {student.email}".

---

## 3. The student attempt page

### 3.1 Layout (`app/(student)/attempts/[aid]/page.tsx`)

Server Component shell + Client Component form, single-page scroll.

**Server Component responsibilities:**

1. Auth gate via `requireStudent()` (or instructor — both can take quizzes).
2. Load the attempt row; verify ownership; verify `status='in_progress'` (else redirect appropriately).
3. Load all answer rows for this attempt (already exist from `startAttemptAction` — one per question, with snapshot populated, response possibly populated).
4. Pass `{attempt, answers}` into the Client Component as initial state.

**Client Component responsibilities:**

- Render the scroll layout (top to bottom):
  1. **Header strip** — assessment title, "Attempt N of M", autosave indicator (`Saved` / `Saving…` / `Last saved 3s ago`), `[Submit attempt]` button.
  2. **Question stack** — one card per question in `questions.position` order. Each card:
     - `Q{n}` label + question type badge.
     - Rendered stem (from `snapshot.rendered`, **not** re-rendered against current template).
     - The appropriate `AnswerSurface` in **controlled mode**: `value={responses[questionId]}`, `onChange={updateResponse(questionId, ...)}`.
  3. **Footer strip** — answered count ("8 of 10 answered"), `[Submit attempt]` button (duplicate for long scrolls), `[Save and continue later]` link to `/`.
- Maintain `responses: Map<questionId, Response>` in client state; each input change updates this map.
- Per-question autosave via `useAutosave` hook (see §3.3).
- Submit confirmation modal (§3.4).

### 3.2 `AnswerSurface` controlled-mode refactor

Plan 2's 6 surfaces (in `components/preview/answer-surfaces.tsx`) hold their own state via `useState(null)`. Plan 3 adds optional `value` + `onChange` props. When both are present, the surface is controlled. Otherwise the surface falls back to uncontrolled mode (current Plan 2 behavior).

Also adds a `disabled?: boolean` prop used by the result page for read-only display of the student's submitted response.

The interface contract:

```ts
type AnswerSurfaceProps<R extends Response> = {
  body: QuestionBody; // unchanged — from snapshot.rendered
  value?: R | null; // controlled: current value
  onChange?: (next: R) => void; // controlled: change handler
  disabled?: boolean; // result page read-only
};
```

This is a backwards-compatible change. Plan 2's preview callsite passes neither `value` nor `onChange`, and continues to work.

### 3.3 Autosave hook (`components/attempt/use-autosave.ts`)

```ts
function useAutosave(opts: {
  attemptId: string;
  questionId: string;
  response: Response | null;
  onSave: (input: SaveInput) => Promise<SaveResult>;
  debounceMs?: number; // default 500
}): { status: 'idle' | 'saving' | 'saved' | 'error'; lastSavedAt: Date | null; retry: () => void };
```

Behavior:

- On `response` change: set `dirty=true`, start a `debounceMs` debounce.
- On debounce fire: call `onSave({attemptId, questionId, response})`. While in flight: status='saving'.
- On resolve: status='saved'; record `lastSavedAt = new Date()`. Tick a relative-time string every 5 seconds.
- On reject: status='error'; expose `retry()`. Response stays in client state (not lost).
- `beforeunload` handler: if `dirty` (debounce hasn't fired yet OR a save is in flight), set `event.returnValue = ''` to trigger the browser warning.
- On unmount (page navigate): no `sendBeacon` endpoint in Plan 3. The accepted failure mode: a navigation away within the last `debounceMs` of typing loses that final delta. On resume the answer reverts to its previous-saved state. Documented; acceptable for Wave 1 quiz volume. (Adding a beacon Route Handler would re-introduce the API-route tier Shape A intentionally avoids.)

**Per-question independence:** each card uses its own `useAutosave` instance. A save for Q3 doesn't block a change to Q5.

### 3.4 Submit flow

`[Submit attempt]` button opens a modal:

- If any questions are unanswered (i.e., `responses[questionId]` is null or empty for the type): list them by `Q{n}` with anchor links scrolling back to the card. Buttons: `[Submit anyway]`, `[Cancel]`.
- If all answered: simple confirmation: "This will end your attempt and reveal correct answers. Continue?" Buttons: `[Submit]`, `[Cancel]`.

On confirm:

1. Wait for any in-flight autosaves across **all** question cards to settle (block submit while any card's `useAutosave` reports `status === 'saving'` or `dirty === true`). Force a synchronous flush of pending debounces first, then await all in-flight promises.
2. Call `submitAttemptAction(attemptId)`.
3. On success: redirect to `/attempts/[aid]/result`.
4. On failure: show an error banner with a retry button; do not navigate.

---

## 4. Snapshot shape and auto-grade dispatch

This is the keystone of the grading correctness contract. The snapshot is fully self-contained at write time, and grading is a pure function of `(snapshot, response)` thereafter.

### 4.1 `AnswerSnapshot` type (`lib/grading/snapshot.ts`)

```ts
type AnswerSnapshot = {
  // Provenance (debugging, dispute review — never used as grading input)
  question_id: string;
  question_type: QuestionType; // 'mc' | 'ma' | 'tf' | 'numeric' | 'short_answer' | 'fill_in'
  seed: number; // attempt.seed (same for every question in the attempt)
  rendered_at: string; // ISO timestamp

  // Materialized state — what the student actually saw
  materialized_values: MaterializedValues; // { compound: 'NaCl', mass: 140, ... }
  rendered: RenderOutput; // structured output from renderQuestion (Plan 2)

  // Precomputed, fully-resolved grading target
  scoring: SnapshotScoring;
};

type SnapshotScoring =
  | { type: 'mc'; correct_id: string; choices: Array<{ id: string; label: string }> }
  | {
      type: 'ma';
      correct_ids: string[];
      partial_credit: boolean;
      choices: Array<{ id: string; label: string }>;
    }
  | { type: 'tf'; correct: boolean }
  | { type: 'numeric'; target: number; tolerance: number; unit: string | null }
  | { type: 'short_answer'; pattern: string; case_insensitive: boolean }
  | { type: 'fill_in'; blanks: Array<{ id: string; target: string; case_insensitive: boolean }> };
```

**The `choices` field on `mc`/`ma`** is duplicated from `rendered` so the reveal panel doesn't have to walk the rendered structure to find a choice label by id.

**The numeric `target`** is computed ONCE at snapshot time by `formula.evaluate(question.scoring.formula, materialized_values)`. At grade time there is no formula evaluation.

**The short_answer `pattern`** is the regex source AFTER `{{var}}` substitution against `materialized_values`. At grade time there is no substitution.

**The fill_in `blanks`** has one entry per `{{blank:id}}` token in the stem. Targets are pre-substituted strings.

### 4.2 Snapshot capture (`lib/grading/snapshot-builder.ts`)

```ts
function buildSnapshot(input: {
  question: QuestionRow;
  variables: QuestionVariableRow[];
  seed: number;
}): AnswerSnapshot;
```

Pure function. Pipeline:

1. Materialize variables: `materializeVariables(variables, seed)` → `MaterializedValues` (reuses Plan 2's materializer).
2. Render the question: `renderQuestion({question, materialized_values, seed})` → `RenderOutput` (reuses Plan 2's renderer).
3. Build type-discriminated `SnapshotScoring` from `question.scoring` + `materialized_values`:
   - **mc/ma**: copy `correct_id`/`correct_ids` + `partial_credit` directly; copy `choices` (id + label) from rendered.
   - **tf**: copy `correct` directly.
   - **numeric**: evaluate `formula` against `materialized_values` → `target`; copy `tolerance`, `unit`.
   - **short_answer**: substitute `pattern` against `materialized_values` → final regex source; copy `case_insensitive`.
   - **fill_in**: for each blank, substitute `target` against `materialized_values`.
4. Assemble + return.

`buildSnapshot` never touches the DB. Used by `startAttemptAction` to build one snapshot per question, then bulk-insert into `answers`.

### 4.3 Auto-grade (`lib/grading/grade.ts`)

```ts
function gradeAnswer(snapshot: AnswerSnapshot, response: Response | null): GradeResult;

type GradeResult =
  | { ok: true; auto_score: number; score_method: 'auto' }
  | { ok: false; auto_score: 0; score_method: 'auto_error'; error: string };
```

`gradeAnswer` is pure, synchronous, **never throws** (top-level try/catch wraps unexpected errors into `auto_error`). Dispatches on `snapshot.question_type`. `auto_score` is always in `[0, 1]`.

| Type                    | Grade rule                                                                                                                                                                                                                  | Score                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **null/empty response** | If `response` is null or the type-specific "empty" check is true: `auto_score: 0`, `score_method: 'auto'`, no error. (Unanswered ≠ malformed.)                                                                              | 0                    |
| **mc**                  | `response.choice_id === snapshot.scoring.correct_id`                                                                                                                                                                        | 1 if match, else 0   |
| **ma — strict**         | If `!partial_credit`: 1.0 iff `Set(response.choice_ids) === Set(snapshot.scoring.correct_ids)`, else 0.                                                                                                                     | 1 or 0               |
| **ma — partial**        | `max(0, correct_picks / total_correct - wrong_picks / total_wrong)`. `total_wrong = total_choices - total_correct`.                                                                                                         | fractional in [0, 1] |
| **tf**                  | `response.value === snapshot.scoring.correct`                                                                                                                                                                               | 1 or 0               |
| **numeric**             | `parsed = Number(response.value.trim())`. If `!Number.isFinite(parsed)` → `auto_error: 'unparseable response'` (score 0). Else: `Math.abs(parsed - target) <= tolerance` → 1 or 0.                                          | 1 or 0 (or error)    |
| **short_answer**        | `new RegExp(pattern, case_insensitive ? 'i' : '').test(response.value.trim())`. Empty trimmed response → 0 (no error). Invalid regex (defense — shouldn't happen post-Plan 2 validation) → `auto_error: 'invalid pattern'`. | 1 or 0 (or error)    |
| **fill_in**             | Per-blank: case-insensitive (or case-sensitive) `===` match on `(response.blanks[id] ?? '').trim()` vs `target`. Missing/empty blanks score 0 (no error). Score = `correct_blanks / total_blanks`. Always partial credit.   | fractional in [0, 1] |

### 4.4 Attempt-level summary

After all answers are graded, `submitAttemptAction` computes:

```ts
type AttemptSummary = {
  raw_score: number; // sum of auto_scores
  max_score: number; // count of answers (each question worth 1)
  percentage: number; // raw_score / max_score, rounded to 2 decimals
};
```

Written to `attempts.summary` (JSONB, new column in migration `0014`).

**No question weighting in Plan 3.** Every question is worth 1.0. Weighting is a Plan 4+ polish item.

---

## 5. Server Actions

All Plan 3 Server Actions live under `app/(student)/.../actions.ts` and call `requireStudent()` (or `requireInstructor()` for gradebook actions, if any) as their first line.

### 5.1 `startAttemptAction(assessmentId: string): Promise<StartResult>`

```ts
type StartResult =
  | { ok: true; attemptId: string }
  | { ok: false; error: 'not_published' | 'closed' | 'no_attempts_remaining' | 'unknown' };
```

Algorithm:

1. `const { user } = await requireStudent()`.
2. Load assessment by id. RLS already filters to published-and-open rows for students; if no row → return `{ok: false, error: 'not_published'}`.
3. Verify `now() within [opens_at, closes_at]` → else `'closed'`.
4. SELECT any in-progress attempt for `(assessment_id, student_user_id=user.id)`. If found → return `{ok: true, attemptId: existing.id}` (idempotent resume).
5. Compute `max_attempts = assessment.default_attempts + COALESCE(override.extra_attempts, 0)`. Override lookup via `assessment_overrides` table (already exists from Plan 1).
6. COUNT submitted attempts. If `count >= max_attempts` → `'no_attempts_remaining'`.
7. `attempt_no = count + 1`. `seed = stableSeed(student_id, assessment_id, attempt_no)`.
8. Load all `questions` + their `question_variables` for this assessment.
9. For each question: `snapshot = buildSnapshot({question, variables, seed})`.
10. **Single PL/pgSQL function call** `start_attempt(p_assessment_id, p_student_user_id, p_attempt_no, p_seed, p_snapshots jsonb)`:
    - INSERT into `attempts` (status='in_progress', seed, attempt_no, started_at=now()).
    - For each entry in `p_snapshots`: INSERT into `answers` (attempt_id, question_id, rendered_question_snapshot, response=null).
    - Return the new `attempts.id`.
11. Return `{ok: true, attemptId}`.

### 5.2 `saveAnswerAction(input: SaveInput): Promise<SaveResult>`

```ts
type SaveInput = { attemptId: string; questionId: string; response: Response };
type SaveResult =
  | { ok: true }
  | { ok: false; error: 'not_yours' | 'already_submitted' | 'invalid_response' | 'unknown' };
```

1. `const { user } = await requireStudent()`.
2. Validate `response` shape via per-type zod schema. On fail → `'invalid_response'`.
3. SELECT `attempts.status` for `attemptId` (RLS scopes to owner). If row missing → `'not_yours'`. If `status != 'in_progress'` → `'already_submitted'`.
4. UPDATE `answers SET response = $1, updated_at = now() WHERE attempt_id = $2 AND question_id = $3` (no snapshot touch). RLS WITH CHECK scopes to attempt owner via `student_owns_in_progress_attempt(p_attempt_id, p_user_id)` helper from migration `0015`.
5. Check `rowsAffected > 0`. If 0 → `'not_yours'` (defense-in-depth — RLS should already have caught it).
6. Return `{ok: true}`.

**No `revalidatePath` call.** Autosave is a hot path; we don't want server-component refetches on every keystroke. The submit flow handles revalidation.

### 5.3 `submitAttemptAction(attemptId: string): Promise<SubmitResult>`

```ts
type SubmitResult =
  | { ok: true; summary: AttemptSummary }
  | { ok: false; error: 'not_yours' | 'already_submitted' | 'unknown' };
```

1. `const { user } = await requireStudent()`.
2. Load attempt; verify ownership + `status='in_progress'`. Else error.
3. Load all answer rows (snapshot + response) for the attempt.
4. For each: `gradeAnswer(snapshot, response)` → build `{question_id, auto_score, score_method, error?}`.
5. Compute `summary` from grades.
6. Single PL/pgSQL function call `submit_attempt(p_attempt_id, p_grades jsonb, p_summary jsonb)`:
   - UPDATE `attempts SET status='submitted', submitted_at=now(), summary=$1 WHERE id=$2 AND status='in_progress'` (idempotent: if already submitted, the WHERE clause makes it a no-op).
   - For each entry in `p_grades`: UPDATE `answers SET auto_score=$1, score_method=$2, graded_at=now() WHERE attempt_id=$3 AND question_id=$4`.
   - SECURITY DEFINER so RLS doesn't block the cross-table updates; explicit `student_owns_in_progress_attempt(p_attempt_id, auth.uid())` check at top of function.
7. `revalidatePath('/attempts/[aid]')` + `revalidatePath('/attempts/[aid]/result')` + `revalidatePath('/')` (home page status updates).
8. Return `{ok: true, summary}`.

### 5.4 Auth helpers (`lib/auth/require.ts`)

```ts
async function requireStudent(): Promise<{ user: AuthUser; role: 'student' | 'instructor' }>;
async function requireInstructor(): Promise<{ user: AuthUser }>;
```

- `requireStudent`: must be authenticated; `role` must be `student` or `instructor` (instructors can take quizzes). On miss: throws `redirect('/sign-in')` or `notFound()`.
- `requireInstructor`: must be authenticated; role must be `instructor`. On miss: throws `notFound()` (don't reveal `(instructor)` route shape to students).

Plan 2's existing Server Actions (`createAssessmentAction`, `updateSettingsAction`, `createQuestionAction`, `saveQuestionAction`, `reorderQuestionAction`, `deleteQuestionAction`) get one-line refactors to call `requireInstructor()` at the top. Single follow-up task; doesn't change semantics (the layout already gates), but adds defense-in-depth.

---

## 6. Result page and multi-attempt mechanics

### 6.1 Result page (`/attempts/[aid]/result`)

Server Component. Loads:

- The attempt row (including `summary`).
- All answer rows for the attempt (snapshot + response + auto_score + score_method + graded_at).
- The student's best attempt for this assessment (`MAX(summary->>'raw_score')`) — used for the "highest so far" badge.
- The student's attempts_used + max_attempts (default + override).

Renders:

1. **Header strip** — assessment title + "Attempt N of M" + submitted timestamp + `← Home` link.
2. **Score banner** — large display: `8/10 — 80%`. Always shows raw + percentage.
3. **Best-so-far badge** — "Highest score on this assessment: 9/10" (omitted if this attempt is the only one or already the highest).
4. **Action strip** — `[Start new attempt]` button (form posting to `startAttemptAction`) if attempts remaining > 0. Disabled if window closed. Helper text below: "You have 2 attempts remaining" or "No attempts remaining."
5. **Question stack** — for each answer row:
   - `Q{n}` label + question type badge.
   - Rendered stem from snapshot (not re-rendered).
   - Student's response in the appropriate `AnswerSurface` with `disabled=true` + `value={response}`.
   - **Correctness badge** — `✓ Correct (1/1)` / `✗ Incorrect (0/1)` / `Partial credit (0.67/1)`.
   - **Correct answer reveal block** (always shown — D4/D9) — type-dispatched component reading `snapshot.scoring`:
     - **mc**: "Correct answer: {label of `correct_id`}"
     - **ma**: "Correct answers: {labels of `correct_ids`, joined}". If `partial_credit`, also breakdown ("You picked 2 of 3 correct, plus 1 wrong").
     - **tf**: "Correct: True" or "Correct: False"
     - **numeric**: "Expected: {target} ± {tolerance} {unit}". If student response was unparseable, banner: "Your answer was not a number."
     - **short_answer**: "Pattern: `{pattern}` (case-{sensitive|insensitive})". Caveat: regex source is shown verbatim — instructors should pick patterns whose source reads as human guidance (e.g., `^(NaCl|sodium chloride)$` is fine; opaque alternations less so). Out-of-scope improvement: a separate `model_answer` field for human-friendly reveal.
     - **fill_in**: per-blank line "Blank {id}: expected `{target}` — your answer was `{response}`."
   - Error banner if `score_method === 'auto_error'`: "We couldn't grade this answer automatically (`{error}`). Please contact your instructor."

### 6.2 Multi-attempt mechanics

- Default cap: `assessment.default_attempts` (existing column).
- Override: `assessment_overrides.extra_attempts` adds to the cap (existing column).
- Each new attempt: fresh `seed = stableSeed(student, assessment, attempt_no)` → fresh materialization → fresh snapshots → fresh response state.
- Spec §6.2.2 contract honored.
- Gradebook score = `MAX(summary->>'raw_score')` per (student, assessment) — see §7.

### 6.3 Resume

`/take/[id]` flow (Server Component):

1. `requireStudent()`.
2. Load assessment. If not published / closed / not within window → render an info page ("Not available").
3. SELECT in-progress attempt for `(assessment, student)`. If found → `redirect('/attempts/[aid]')`.
4. Compute `max_attempts`. If `submitted_count >= max_attempts` → render "no attempts remaining" with link to result of best attempt.
5. Else → call `startAttemptAction(id)`; on success redirect to the new `/attempts/[aid]`. On failure render error page.

`/attempts/[aid]` (Server Component):

- Load attempt (RLS scopes to owner).
- If `status='submitted'` → `redirect('/attempts/[aid]/result')`.
- Else load all answer rows → pass into Client Component as initial state (`initialResponses: Map<questionId, Response | null>`). Client picks up where the student left off.

### 6.4 Cross-attempt question state

Each attempt has its own `answers` rows (one per question, scoped by `attempt_id`). Attempt 2 cannot see attempt 1's snapshot or response. There is no cross-attempt state sharing — every attempt is fresh.

---

## 7. Instructor gradebook

### 7.1 Per-assessment gradebook table (`/assessments/[id]/attempts/page.tsx`)

Server Component. Loads via a Postgres view `gradebook_rows`:

```sql
CREATE VIEW gradebook_rows AS
SELECT
  a.assessment_id,
  a.student_user_id,
  u.email AS student_email,
  COUNT(*) FILTER (WHERE a.status = 'submitted') AS attempts_used,
  MAX((a.summary->>'raw_score')::numeric) FILTER (WHERE a.status = 'submitted') AS best_raw,
  MAX((a.summary->>'max_score')::numeric) FILTER (WHERE a.status = 'submitted') AS best_max,
  MAX((a.summary->>'percentage')::numeric) FILTER (WHERE a.status = 'submitted') AS best_pct,
  MAX(a.submitted_at) FILTER (WHERE a.status = 'submitted') AS last_submitted_at,
  (
    SELECT id FROM attempts a2
    WHERE a2.assessment_id = a.assessment_id
      AND a2.student_user_id = a.student_user_id
      AND a2.status = 'submitted'
    ORDER BY (a2.summary->>'raw_score')::numeric DESC NULLS LAST, a2.submitted_at DESC
    LIMIT 1
  ) AS best_attempt_id
FROM attempts a
JOIN users u ON u.id = a.student_user_id
GROUP BY a.assessment_id, a.student_user_id, u.email;
```

(The view is RLS-aware via `attempts`'s policies. Instructors get rows only for assessments they own; students get only their own — students could query the view too, harmlessly.)

The page query: `SELECT * FROM gradebook_rows WHERE assessment_id = $1 ORDER BY [sortCol] [sortDir]`.

Columns rendered:

| Student  | Attempts | Best score | Best % | Last submitted   | Actions                |
| -------- | -------- | ---------- | ------ | ---------------- | ---------------------- |
| jane@... | 2 of 3   | 8 / 10     | 80%    | 2026-06-12 14:32 | [View best] [View all] |

- **[View best]** → `/assessments/[id]/attempts/[best_attempt_id]`.
- **[View all]** → expands inline (or links to a filtered list — implementation detail of Plan 3 task). Shows all submitted attempts for this student, each linkable to the drill-down.
- Header clicks toggle ASC/DESC via URL search params (`?sort=best_pct&dir=desc`) so deep links work.
- Sort default: `last_submitted_at DESC NULLS LAST`.
- No pagination (≤25 students in the summer cohort; Wave 2 polish if needed).
- Empty state: "No students have attempted this assessment yet."
- In-progress attempts: not in the gradebook (an `attempts_in_progress` summary chip above the table — "3 attempts in progress" — for proctoring visibility, no drill-down).

### 7.2 Drill-down (`/assessments/[id]/attempts/[aid]/page.tsx`)

Server Component. Loads the attempt + all answers (RLS via `instructor_owns_attempt_assessment(p_attempt_id, p_user_id)`, already a helper from Plan 1 migration `0012`).

Renders the **same result page component** as `/attempts/[aid]/result` with an `actor: 'student' | 'instructor'` prop:

- `actor='student'` (default): "Start new attempt" button, "Highest score so far" banner from the student's own attempts.
- `actor='instructor'`: header reads "Attempt N by {student.email} — submitted {timestamp}"; sidebar shows all other attempts by this student on this assessment with quick-links; no "Start new attempt" button.

Same correctness badges, same reveal blocks. The instructor view is intentionally identical to the student view — render-fidelity end-to-end.

### 7.3 Entry from assessment overview

`app/(instructor)/assessments/[id]/page.tsx` (the existing overview page from Plan 2) gets a new link in the header strip: `[Attempts (3 submitted)]` linking to `/attempts`. One-line patch; count derived from `gradebook_rows`.

---

## 8. Database changes

### 8.1 Migration `0014_attempt_summary.sql`

```sql
-- attempts.summary holds the post-grade attempt-level rollup
ALTER TABLE attempts
  ADD COLUMN summary JSONB;  -- { raw_score, max_score, percentage } | null until submitted

-- Index for gradebook ORDER BY (last_submitted_at DESC) and resume lookups
CREATE INDEX IF NOT EXISTS attempts_by_assessment_student
  ON attempts (assessment_id, student_user_id, submitted_at DESC);
```

Plan 1's `0005_attempts.sql` did NOT ship a `score` column (verified at spec time), so no fold-or-drop decision is needed. `summary` is the only attempt-level scoring field.

The `attempt_status` enum already has four values from Plan 1: `'in_progress'`, `'submitted'`, `'graded'`, `'auto_submitted'`. Plan 3 uses only the first two. `'auto_submitted'` is reserved for the Wave 3 exam-timer auto-submit path. `'graded'` is reserved for a future manual-review path (e.g., short-answer instructor override) — Plan 3 does not transition to it; auto-graded attempts stay at `'submitted'`.

### 8.2 Migration `0015_grading_helpers.sql`

```sql
-- SECURITY DEFINER helpers to break potential RLS recursion when writing answers/attempts.
-- Follows the established pattern from 0011 / 0012 / 0013.

CREATE OR REPLACE FUNCTION public.student_owns_in_progress_attempt(
  p_attempt_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM attempts
    WHERE id = p_attempt_id
      AND student_user_id = p_user_id
      AND status = 'in_progress'
  );
$$;

-- Update answers UPDATE policy to use the helper for the in-progress write window.
DROP POLICY IF EXISTS answers_student_update ON answers;
CREATE POLICY answers_student_update ON answers
  FOR UPDATE
  USING (public.student_owns_in_progress_attempt(answers.attempt_id, (SELECT auth.uid())))
  WITH CHECK (public.student_owns_in_progress_attempt(answers.attempt_id, (SELECT auth.uid())));

-- start_attempt(): atomic INSERT attempts + INSERT N answers
CREATE OR REPLACE FUNCTION public.start_attempt(
  p_assessment_id uuid,
  p_student_user_id uuid,
  p_attempt_no integer,
  p_seed bigint,
  p_snapshots jsonb  -- [{question_id, snapshot}, ...]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt_id uuid;
  v_entry jsonb;
BEGIN
  -- Caller must be the student
  IF (SELECT auth.uid()) <> p_student_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO attempts (assessment_id, student_user_id, attempt_no, seed, status, started_at)
  VALUES (p_assessment_id, p_student_user_id, p_attempt_no, p_seed, 'in_progress', now())
  RETURNING id INTO v_attempt_id;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_snapshots) LOOP
    INSERT INTO answers (attempt_id, question_id, rendered_question_snapshot, response)
    VALUES (
      v_attempt_id,
      (v_entry->>'question_id')::uuid,
      v_entry->'snapshot',
      NULL
    );
  END LOOP;

  RETURN v_attempt_id;
END;
$$;

-- submit_attempt(): atomic UPDATE attempts + UPDATE N answers
CREATE OR REPLACE FUNCTION public.submit_attempt(
  p_attempt_id uuid,
  p_grades jsonb,    -- [{question_id, auto_score, score_method}, ...]
  p_summary jsonb    -- { raw_score, max_score, percentage }
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
  v_grade jsonb;
  v_rows integer;
BEGIN
  -- Ownership + in-progress check
  SELECT student_user_id INTO v_owner
  FROM attempts
  WHERE id = p_attempt_id AND status = 'in_progress';

  IF v_owner IS NULL OR v_owner <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized or already submitted';
  END IF;

  FOR v_grade IN SELECT * FROM jsonb_array_elements(p_grades) LOOP
    UPDATE answers SET
      auto_score = (v_grade->>'auto_score')::numeric,
      score_method = v_grade->>'score_method',
      graded_at = now(),
      updated_at = now()
    WHERE attempt_id = p_attempt_id
      AND question_id = (v_grade->>'question_id')::uuid;
  END LOOP;

  UPDATE attempts SET
    status = 'submitted',
    submitted_at = now(),
    summary = p_summary
  WHERE id = p_attempt_id AND status = 'in_progress';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'race: attempt already submitted';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.student_owns_in_progress_attempt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_attempt(uuid, uuid, integer, bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_attempt(uuid, jsonb, jsonb) TO authenticated;
```

### 8.3 Migration `0016_gradebook_view.sql`

The `gradebook_rows` view from §7.1. Created as a security-invoker view (default for PG ≥ 15) so RLS on `attempts` flows through.

### 8.4 Existing RLS audit

Plan 1's `0010` / `0011` / `0012` / `0013` already cover:

- `attempts` SELECT — student sees own; instructor sees own assessments' attempts.
- `attempts` INSERT — only via `start_attempt()` (the function bypasses RLS but checks `auth.uid()`).
- `answers` SELECT — same shape via `student_has_attempt` / `instructor_owns_attempt_assessment`.
- `answers` snapshot-immutable trigger (Plan 1 `0006`).

Plan 3 adds:

- `answers` UPDATE policy refined via `student_owns_in_progress_attempt` (only on in-progress attempts).
- `attempts` UPDATE policy: students cannot UPDATE directly — only via `submit_attempt()` SECURITY DEFINER.

---

## 9. Testing strategy

| Layer                           | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit (vitest)**               | `lib/grading/grade.ts` — table-driven over (type, response, expected): all 6 types × {correct, incorrect, partial, empty, malformed}. ~40 cases. `lib/grading/snapshot-builder.ts` — fixtures for each type, asserting the snapshot shape including precomputed targets. `lib/auth/require.ts` — happy + reject paths via mocked Supabase. ~50 new tests.                                                                                                                                                                                |
| **RLS (Playwright)**            | `tests/rls/attempts-isolation.spec.ts` — student A cannot SELECT/UPDATE student B's attempts; student A cannot insert with `student_user_id=B`; instructor cannot read attempts on non-owned assessments. `tests/rls/answers-isolation.spec.ts` — same matrix for answers. `tests/rls/snapshot-immutability-plan3.spec.ts` — attempt at UPDATE on snapshot column fails after `submit_attempt`. `tests/rls/submit-after-submit.spec.ts` — second submit is a no-op + clear error.                                                        |
| **a11y (axe-core)**             | `tests/a11y/take-page.spec.ts` (seed in-progress attempt + nav), `tests/a11y/result-page.spec.ts` (seed submitted attempt), `tests/a11y/gradebook.spec.ts` (instructor table). 3 new specs, same pattern as Plan 2's 4 specs.                                                                                                                                                                                                                                                                                                            |
| **E2E happy path (Playwright)** | `tests/student/take-and-submit.spec.ts` — sign in as student, navigate `/take/[id]`, answer all 6 question types, submit, assert score on result. `tests/student/resume-attempt.spec.ts` — start, answer 2 of 5, close tab, reopen, assert state restored. `tests/student/retake-different-seed.spec.ts` — submit attempt 1, start attempt 2, assert materialized values differ. `tests/instructor/gradebook-shows-attempts.spec.ts` — seed 2 students with attempts, open gradebook, assert both rows + best scores + drill-down works. |
| **NVDA runbook**                | Append "Plan 3 — Student attempt + result + gradebook critical path" section to `docs/runbooks/nvda-test-script.md`. ~10 steps: sign in as student, navigate `/take/[id]`, navigate by heading, answer 6 question types via keyboard, submit, hear score, navigate to result, hear correctness + reveal. Required manual pass before Plan 3 merge.                                                                                                                                                                                       |

Tests-to-write estimate: ~50 vitest unit tests + 4 RLS specs + 3 axe specs + 4 E2E specs. Comparable to Plan 2's footprint.

---

## 10. Carried risks + out-of-scope

### Risks Plan 3 carries

1. **First PL/pgSQL helper functions in the codebase.** `start_attempt` and `submit_attempt` are the first non-trivial plpgsql we've written. Mitigation: keep them dead-simple (loops + UPDATEs); cover with RLS tests; the SECURITY DEFINER pattern is established from Plan 1 helpers.
2. **Server-Action autosave granularity.** One POST per question × debounced 500ms ≈ ~500 RPC/min upper bound during a quiz period across the whole class. Vercel Fluid Compute's concurrent-reuse handles this comfortably. Risk only at scale we won't hit in Wave 1.
3. **`navigator.sendBeacon` on unmount is best-effort.** Common case is the debounce having already fired. Worst case: last 500ms of typing not saved if the browser crashes within that window. Acceptable.
4. **Reveal-on-result during multi-attempt = students can memorize.** Acknowledged in D4. Wave 3 exam mode will have a locked-reveal result page.
5. **Latent RLS recursion via INSERT…RETURNING into `answers`.** Already a documented gotcha (`tech-gotchas.md`, `0013_fix_overrides_rls_recursion.sql`). Mitigation: pre-emptive `student_owns_in_progress_attempt` helper (migration `0015`); RLS coverage tests catch any miss.
6. **No question weighting in Plan 3.** Every question = 1.0. If a Plan 3 assessment needs weighted scoring, instructors must defer to Plan 4 polish or reshape the quiz into more questions. Documented; not a blocker for Wave 1 quizzes.

### Explicitly out-of-scope (Plan 4 or later)

- CSV export of gradebook (Canvas format) → Plan 4.
- Images in question bodies via Supabase Storage signed URLs → Plan 4.
- Per-assessment `reveal_correct_answers` toggle → polish.
- Roster-aware gradebook (zero-row entries for never-started students) → polish.
- Question randomization, choice randomization, exam timer, auto-submit-on-expiry → Wave 3.
- Ketcher / RDKit / chem question types → Wave 2.
- Accommodations UI (extra_time, available_until_override, alternative_format) → Wave 3. Plan 3 honors `extra_attempts` only.
- Question weighting → Plan 4+ polish.
- Pagination on the gradebook table → Wave 2 polish if cohort grows.
- Question-level partial-credit policies beyond MA "per-correct-pick minus per-wrong-pick" and fill_in "correct-blanks / total-blanks" → polish.

---

_End of Plan 3 design spec._
