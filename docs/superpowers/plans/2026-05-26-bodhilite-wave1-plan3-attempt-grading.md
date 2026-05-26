# BodhiLite Wave 1 Plan 3 — Student Attempt + Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the student attempt + grading surface for Wave 1 — eager snapshot capture at attempt start, per-question autosave via Server Actions, synchronous auto-grade on submit, full reveal on the result page, multi-attempt with auto-resume + highest-counts scoring, and the instructor gradebook UI with drill-down. All grading flows from precomputed snapshot targets; no formula re-evaluation on the grade path.

**Architecture:** Snapshots wrap Plan 2's `RenderOutput` (which already encodes materialized values + precomputed grading targets) plus minimal provenance fields. Snapshot capture happens in a `start_attempt(...)` SECURITY DEFINER PL/pgSQL helper that atomically inserts the attempt row + N answer rows with snapshots. Auto-grade is a pure function `gradeAnswer(snapshot, response)` dispatched per question type. Submit runs grading in the JS Server Action, then writes auto-scores + attempt summary atomically via a second SECURITY DEFINER helper `submit_attempt(...)`. RLS on `answers UPDATE` is tightened via `student_owns_in_progress_attempt(...)` to prevent post-submit mutation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict-plus, Tailwind v4, shadcn (radix-nova), Supabase Postgres + Auth + RLS, Vitest + Playwright + axe-core for tests, PL/pgSQL for multi-row atomic writes.

**Parent spec:** [`../specs/2026-05-26-bodhilite-wave1-plan3-attempt-grading-design.md`](../specs/2026-05-26-bodhilite-wave1-plan3-attempt-grading-design.md)

**Predecessor plans:**

- [`2026-05-16-bodhilite-wave1-foundation.md`](2026-05-16-bodhilite-wave1-foundation.md) (Plan 1 — merged `eb9e319`)
- [`2026-05-18-bodhilite-wave1-plan2-authoring.md`](2026-05-18-bodhilite-wave1-plan2-authoring.md) (Plan 2 — merged `694e5c3`)

---

## File map

Files this plan creates or touches:

```
supabase/migrations/
  0014_attempt_summary.sql                        ★ new
  0015_grading_helpers.sql                        ★ new
  0016_gradebook_view.sql                         ★ new

lib/
  types/
    database.ts                                   ☆ regen
  grading/
    snapshot.ts                                   ★ new
    snapshot.test.ts                              ★ new
    grade.ts                                      ★ new
    grade.test.ts                                 ★ new
    summary.ts                                    ★ new
    summary.test.ts                               ★ new
    index.ts                                      ☆ modify
  rendering/
    types.ts                                      ☆ modify
    render.ts                                     ☆ modify
  auth/
    require.ts                                    ★ new
    require.test.ts                               ★ new

app/
  page.tsx                                        ☆ modify (student assessments list)
  (student)/
    take/
      [id]/
        page.tsx                                  ★ new
        actions.ts                                ★ new (startAttemptAction)
    attempts/
      [aid]/
        page.tsx                                  ★ new (server shell)
        client.tsx                                ★ new (attempt page client)
        actions.ts                                ★ new (saveAnswerAction, submitAttemptAction)
        result/
          page.tsx                                ★ new (post-submit result)
  (instructor)/
    assessments/
      [id]/
        page.tsx                                  ☆ modify (attempts link)
        attempts/
          page.tsx                                ★ new (gradebook)
          [aid]/
            page.tsx                              ★ new (drilldown)

components/
  ui/
    alert-dialog.tsx                              ★ new (shadcn)
  preview/
    answer-surfaces.tsx                           ☆ modify (controlled mode + disabled)
  attempt/
    AttemptHeader.tsx                             ★ new
    QuestionCard.tsx                              ★ new
    SubmitDialog.tsx                              ★ new
    use-autosave.ts                               ★ new
    use-autosave.test.ts                          ★ new
  result/
    ResultPage.tsx                                ★ new
    CorrectAnswerReveal.tsx                       ★ new
  gradebook/
    GradebookTable.tsx                            ★ new

tests/
  rls/
    attempts-isolation.spec.ts                    ★ new
    answers-isolation.spec.ts                     ★ new
    snapshot-immutability-plan3.spec.ts           ★ new
    submit-after-submit.spec.ts                   ★ new
  a11y/
    take-page.spec.ts                             ★ new
    result-page.spec.ts                           ★ new
    gradebook.spec.ts                             ★ new
  student/
    take-and-submit.spec.ts                       ★ new
    resume-attempt.spec.ts                        ★ new
    retake-different-seed.spec.ts                 ★ new
  instructor/
    gradebook-shows-attempts.spec.ts              ★ new

docs/
  runbooks/
    nvda-test-script.md                           ☆ modify (Plan 3 critical path)
```

**33 tasks. Each task = one atomic commit.**

Task order is dependency-driven: migrations → pure-TS keystone (snapshot/grade/summary + renderer extension) → auth helpers → AnswerSurface refactor → Server Actions → student routes → result page → home/gradebook → Plan 2 refactor → tests → wrap.

---

### Task 1: Migration 0014 — attempts.summary column + index

**Files:**

- Create: `supabase/migrations/0014_attempt_summary.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0014_attempt_summary.sql`:

```sql
-- attempts.summary holds the post-grade attempt-level rollup:
-- { raw_score: number, max_score: number, percentage: number }
-- NULL while in-progress; populated by submit_attempt() at submit time.
ALTER TABLE public.attempts
  ADD COLUMN summary JSONB;

-- Index for gradebook ORDER BY (submitted_at DESC) and resume lookups.
CREATE INDEX IF NOT EXISTS attempts_by_assessment_student
  ON public.attempts (assessment_id, student_user_id, submitted_at DESC);
```

- [ ] **Step 2: Reset local DB to apply**

Run: `npx --yes supabase db reset --local`

Expected: clean reset, all 14 migrations apply without error.

- [ ] **Step 3: Verify the column exists**

Run:

```bash
npx --yes supabase db query --local "SELECT column_name FROM information_schema.columns WHERE table_name='attempts' AND column_name='summary';" 2>/dev/null
```

Expected: one row, `summary`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_attempt_summary.sql
git commit -m "feat(db): add attempts.summary column + per-assessment index"
```

---

### Task 2: Migration 0015 — grading helpers (RLS helper + start_attempt + submit_attempt)

**Files:**

- Create: `supabase/migrations/0015_grading_helpers.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0015_grading_helpers.sql`:

```sql
-- SECURITY DEFINER helpers to break potential RLS recursion and to provide
-- atomic multi-row writes for attempt start + attempt submit.
-- Follows the established pattern from 0011 / 0012 / 0013.

-- ============================================================
-- Helper 1: student_owns_in_progress_attempt
-- Used by the answers UPDATE policy to gate autosave writes.
-- ============================================================
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

-- Tighten answers UPDATE policy: students can only update their own
-- in-progress attempts' answer rows (i.e., autosave, never post-submit).
DROP POLICY IF EXISTS answers_student_update ON public.answers;
CREATE POLICY answers_student_update ON public.answers
  FOR UPDATE
  USING (public.student_owns_in_progress_attempt(answers.attempt_id, (SELECT auth.uid())))
  WITH CHECK (public.student_owns_in_progress_attempt(answers.attempt_id, (SELECT auth.uid())));

-- ============================================================
-- Helper 2: start_attempt
-- Atomic INSERT into attempts + INSERT N answer rows with snapshots.
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_attempt(
  p_assessment_id uuid,
  p_student_user_id uuid,
  p_attempt_no integer,
  p_seed bigint,
  p_snapshots jsonb  -- [{question_id: uuid, snapshot: jsonb}, ...]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt_id uuid;
  v_entry jsonb;
BEGIN
  -- Caller must be the student themself.
  IF (SELECT auth.uid()) <> p_student_user_id THEN
    RAISE EXCEPTION 'unauthorized: caller is not p_student_user_id';
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

-- ============================================================
-- Helper 3: submit_attempt
-- Atomic UPDATE attempts + UPDATE N answer rows with grades.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_attempt(
  p_attempt_id uuid,
  p_grades jsonb,    -- [{question_id: uuid, auto_score: number, score_method: text}, ...]
  p_summary jsonb    -- { raw_score: number, max_score: number, percentage: number }
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
  -- Verify the attempt is in-progress AND owned by the caller.
  SELECT student_user_id INTO v_owner
  FROM attempts
  WHERE id = p_attempt_id AND status = 'in_progress';

  IF v_owner IS NULL OR v_owner <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized or already submitted';
  END IF;

  -- Write per-answer grades. Skipping snapshot column means the immutability
  -- trigger (0006) is not triggered.
  FOR v_grade IN SELECT * FROM jsonb_array_elements(p_grades) LOOP
    UPDATE answers SET
      auto_score = (v_grade->>'auto_score')::numeric,
      score_method = v_grade->>'score_method',
      graded_at = now(),
      updated_at = now()
    WHERE attempt_id = p_attempt_id
      AND question_id = (v_grade->>'question_id')::uuid;
  END LOOP;

  -- Finalize the attempt. Status guard makes this idempotent under race.
  UPDATE attempts SET
    status = 'submitted',
    submitted_at = now(),
    summary = p_summary
  WHERE id = p_attempt_id AND status = 'in_progress';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'race: attempt already submitted by another caller';
  END IF;
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.student_owns_in_progress_attempt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_attempt(uuid, uuid, integer, bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_attempt(uuid, jsonb, jsonb) TO authenticated;
```

- [ ] **Step 2: Reset and verify**

Run: `npx --yes supabase db reset --local`

Expected: all 15 migrations apply cleanly.

- [ ] **Step 3: Smoke-test the helpers exist**

Run:

```bash
npx --yes supabase db query --local "SELECT proname FROM pg_proc WHERE proname IN ('student_owns_in_progress_attempt','start_attempt','submit_attempt') ORDER BY proname;" 2>/dev/null
```

Expected: 3 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_grading_helpers.sql
git commit -m "feat(db): add grading helpers (RLS gate + start_attempt + submit_attempt)"
```

---

### Task 3: Migration 0016 — gradebook_rows view + regen database.ts

**Files:**

- Create: `supabase/migrations/0016_gradebook_view.sql`
- Modify: `lib/types/database.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0016_gradebook_view.sql`:

```sql
-- Per-(assessment, student) aggregate row for the instructor gradebook.
-- RLS-aware via attempts policies (security_invoker = true is default in PG ≥ 15).
CREATE OR REPLACE VIEW public.gradebook_rows AS
SELECT
  a.assessment_id,
  a.student_user_id,
  u.email AS student_email,
  COUNT(*) FILTER (WHERE a.status = 'submitted') AS attempts_used,
  MAX((a.summary->>'raw_score')::numeric)
    FILTER (WHERE a.status = 'submitted') AS best_raw,
  MAX((a.summary->>'max_score')::numeric)
    FILTER (WHERE a.status = 'submitted') AS best_max,
  MAX((a.summary->>'percentage')::numeric)
    FILTER (WHERE a.status = 'submitted') AS best_pct,
  MAX(a.submitted_at) FILTER (WHERE a.status = 'submitted') AS last_submitted_at,
  (
    SELECT id FROM attempts a2
    WHERE a2.assessment_id = a.assessment_id
      AND a2.student_user_id = a.student_user_id
      AND a2.status = 'submitted'
    ORDER BY (a2.summary->>'raw_score')::numeric DESC NULLS LAST,
             a2.submitted_at DESC
    LIMIT 1
  ) AS best_attempt_id
FROM public.attempts a
JOIN public.users u ON u.id = a.student_user_id
GROUP BY a.assessment_id, a.student_user_id, u.email;

GRANT SELECT ON public.gradebook_rows TO authenticated;
```

- [ ] **Step 2: Reset and verify**

Run: `npx --yes supabase db reset --local`

Expected: 16 migrations apply.

- [ ] **Step 3: Regenerate database.ts (stderr to /dev/null per tech-gotcha)**

Run: `npm run db:types`

(Confirm the script in `package.json` is `npx --yes supabase gen types typescript --local 2>/dev/null > lib/types/database.ts` — if not, run that exact command manually.)

Strip any trailing `<claude-code-hint>` annotation from the file if present.

- [ ] **Step 4: Verify typecheck still passes**

Run: `npm run typecheck`

Expected: PASS. The new `summary` column on attempts and the `gradebook_rows` view will appear in the regenerated types.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_gradebook_view.sql lib/types/database.ts
git commit -m "feat(db): add gradebook_rows view + regen database types"
```

---

### Task 4: Extend renderer GradingTarget for MA partial_credit

**Files:**

- Modify: `lib/rendering/types.ts`
- Modify: `lib/rendering/render.ts`
- Modify: `lib/rendering/render.test.ts` (add coverage)

**Why:** Plan 3's grade function needs `partial_credit` for `ma` to decide between strict-set and per-pick scoring. The current renderer drops the flag from `question.scoring`. Adding it makes the snapshot fully self-contained.

- [ ] **Step 1: Read current `lib/rendering/types.ts`**

Look for the `GradingTarget` discriminated union. Find the `ma` variant.

- [ ] **Step 2: Extend the ma variant**

In `lib/rendering/types.ts`, change the `ma` variant of `GradingTarget` from:

```ts
| { kind: 'ma'; correct_ids: string[] }
```

to:

```ts
| { kind: 'ma'; correct_ids: string[]; partial_credit: boolean }
```

- [ ] **Step 3: Update the renderer to copy the flag**

In `lib/rendering/render.ts`, find the `case 'ma':` block in the `switch (input.question.type)`. Change the `target` assignment from:

```ts
target = {
  kind: 'ma',
  correct_ids: (input.question.scoring['correct_ids'] as string[]) ?? [],
};
```

to:

```ts
target = {
  kind: 'ma',
  correct_ids: (input.question.scoring['correct_ids'] as string[]) ?? [],
  partial_credit: Boolean(input.question.scoring['partial_credit']),
};
```

- [ ] **Step 4: Add a test in `lib/rendering/render.test.ts`**

Append to the existing test file (after the existing ma test if there is one):

```ts
import { describe, it, expect } from 'vitest';
import { renderQuestion } from './render';

describe('renderQuestion — ma partial_credit', () => {
  it('copies partial_credit=true from question.scoring into grading_target', () => {
    const out = renderQuestion({
      question: {
        id: 'q1',
        type: 'ma',
        body: { stem: 'Pick all primes', choices: [
          { id: 'a', label: '2' }, { id: 'b', label: '4' }, { id: 'c', label: '3' }
        ]},
        scoring: { correct_ids: ['a','c'], partial_credit: true },
        variables: [],
      },
      seed: 0,
    });
    expect(out.grading_target).toEqual({
      kind: 'ma',
      correct_ids: ['a','c'],
      partial_credit: true,
    });
  });

  it('defaults partial_credit to false when omitted', () => {
    const out = renderQuestion({
      question: {
        id: 'q2',
        type: 'ma',
        body: { stem: 'Pick', choices: [
          { id: 'a', label: 'A' }, { id: 'b', label: 'B' }
        ]},
        scoring: { correct_ids: ['a'] },
        variables: [],
      },
      seed: 0,
    });
    expect(out.grading_target).toMatchObject({
      kind: 'ma',
      partial_credit: false,
    });
  });
});
```

- [ ] **Step 5: Run renderer tests**

Run: `npx vitest run lib/rendering/render.test.ts`
Expected: PASS, including the two new cases.

- [ ] **Step 6: Run full vitest to catch any downstream type fallout**

Run: `npm test -- --run`
Expected: PASS (some Plan 2 tests may need a `partial_credit: false` literal added to fixtures — fix inline if so, matching Plan 2's existing conventions).

- [ ] **Step 7: Commit**

```bash
git add lib/rendering/types.ts lib/rendering/render.ts lib/rendering/render.test.ts
git commit -m "feat(rendering): carry ma partial_credit into grading_target"
```

---

### Task 5: Snapshot type + buildSnapshot wrapper (TDD)

**Files:**

- Create: `lib/grading/snapshot.ts`
- Create: `lib/grading/snapshot.test.ts`

**Why:** `AnswerSnapshot` is the on-disk shape stored in `answers.rendered_question_snapshot`. It wraps `RenderOutput` plus minimal provenance. `buildSnapshot` is the only place this shape is constructed.

- [ ] **Step 1: Write the failing test**

Create `lib/grading/snapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './snapshot';

describe('buildSnapshot', () => {
  it('wraps RenderOutput with provenance fields', () => {
    const snap = buildSnapshot({
      question: {
        id: 'q1',
        type: 'mc',
        body: { stem: 'What is 2+2?', choices: [
          { id: 'a', label: '3' }, { id: 'b', label: '4' }, { id: 'c', label: '5' }
        ]},
        scoring: { correct_id: 'b' },
        variables: [],
      },
      seed: 42,
    });

    expect(snap.question_id).toBe('q1');
    expect(snap.question_type).toBe('mc');
    expect(snap.seed).toBe(42);
    expect(snap.rendered_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snap.render.grading_target).toEqual({ kind: 'mc', correct_id: 'b' });
    expect(snap.render.rendered_body.kind).toBe('mc');
  });

  it('precomputes numeric target by evaluating the formula at snapshot time', () => {
    const snap = buildSnapshot({
      question: {
        id: 'qn',
        type: 'numeric',
        body: { stem: 'Mass of x g?' },
        scoring: { formula: 'mass * 2', tolerance: 0.01 },
        variables: [{ name: 'mass', type: 'randint', spec: { min: 10, max: 10 } }],
      },
      seed: 0,
    });
    expect(snap.render.grading_target).toMatchObject({
      kind: 'numeric',
      value: 20,
      tolerance: 0.01,
    });
  });

  it('substitutes regex pattern at snapshot time for short_answer', () => {
    const snap = buildSnapshot({
      question: {
        id: 'qs',
        type: 'short_answer',
        body: { stem: 'Name the compound' },
        scoring: { pattern: '^{{compound}}$', case_insensitive: true },
        variables: [
          { name: 'compound', type: 'choice', spec: { values: [{ label: 'NaCl' }] } }
        ],
      },
      seed: 0,
    });
    expect(snap.render.grading_target).toMatchObject({
      kind: 'short_answer',
      pattern: '^NaCl$',
      case_insensitive: true,
    });
  });
});
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `npx vitest run lib/grading/snapshot.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the snapshot module**

Create `lib/grading/snapshot.ts`:

```ts
import { renderQuestion } from '@/lib/rendering';
import type { RenderInput, RenderOutput } from '@/lib/rendering';
import type { QuestionType } from '@/lib/schemas';

/**
 * The on-disk shape for answers.rendered_question_snapshot.
 * Self-contained: contains everything grading needs without referencing
 * the live questions row. Wraps RenderOutput, which already encodes
 * materialized values + precomputed grading targets (Plan 2 keystone).
 */
export type AnswerSnapshot = {
  question_id: string;
  question_type: QuestionType;
  seed: number;
  rendered_at: string;
  render: RenderOutput;
};

export type BuildSnapshotInput = {
  question: RenderInput['question'];
  seed: number;
};

export function buildSnapshot(input: BuildSnapshotInput): AnswerSnapshot {
  const render = renderQuestion({ question: input.question, seed: input.seed });
  return {
    question_id: input.question.id,
    question_type: input.question.type,
    seed: input.seed,
    rendered_at: new Date().toISOString(),
    render,
  };
}
```

- [ ] **Step 4: Run the test (expect PASS)**

Run: `npx vitest run lib/grading/snapshot.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add lib/grading/snapshot.ts lib/grading/snapshot.test.ts
git commit -m "feat(grading): add AnswerSnapshot + buildSnapshot wrapper"
```

---

### Task 6: Response type + per-type zod schemas

**Files:**

- Create: `lib/grading/response.ts`
- Create: `lib/grading/response.test.ts`

**Why:** `answers.response` is type-discriminated JSON. The schemas validate Server Action payloads before any DB write.

- [ ] **Step 1: Write the failing test**

Create `lib/grading/response.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ResponseSchema, isResponseEmpty } from './response';

describe('ResponseSchema', () => {
  it('accepts a valid mc response', () => {
    const r = ResponseSchema.parse({ type: 'mc', choice_id: 'a' });
    expect(r.type).toBe('mc');
  });

  it('accepts null choice_id (unanswered mc)', () => {
    expect(() => ResponseSchema.parse({ type: 'mc', choice_id: null })).not.toThrow();
  });

  it('rejects unknown type', () => {
    expect(() => ResponseSchema.parse({ type: 'bogus' })).toThrow();
  });

  it('accepts ma with array', () => {
    const r = ResponseSchema.parse({ type: 'ma', choice_ids: ['a', 'b'] });
    expect(r).toEqual({ type: 'ma', choice_ids: ['a', 'b'] });
  });

  it('accepts numeric raw value as string', () => {
    const r = ResponseSchema.parse({ type: 'numeric', value: '4.5' });
    expect(r.type).toBe('numeric');
  });

  it('accepts fill_in blanks as record', () => {
    const r = ResponseSchema.parse({ type: 'fill_in', blanks: { b1: 'x', b2: '' } });
    expect(r).toEqual({ type: 'fill_in', blanks: { b1: 'x', b2: '' } });
  });
});

describe('isResponseEmpty', () => {
  it('treats null mc choice as empty', () => {
    expect(isResponseEmpty({ type: 'mc', choice_id: null })).toBe(true);
  });
  it('treats non-null mc choice as non-empty', () => {
    expect(isResponseEmpty({ type: 'mc', choice_id: 'a' })).toBe(false);
  });
  it('treats empty ma set as empty', () => {
    expect(isResponseEmpty({ type: 'ma', choice_ids: [] })).toBe(true);
  });
  it('treats whitespace-only short_answer as empty', () => {
    expect(isResponseEmpty({ type: 'short_answer', value: '   ' })).toBe(true);
  });
  it('treats null tf as empty', () => {
    expect(isResponseEmpty({ type: 'tf', value: null })).toBe(true);
  });
  it('treats fill_in with all-empty blanks as empty', () => {
    expect(isResponseEmpty({ type: 'fill_in', blanks: { b1: '', b2: '   ' } })).toBe(true);
  });
  it('treats fill_in with one non-empty blank as non-empty', () => {
    expect(isResponseEmpty({ type: 'fill_in', blanks: { b1: '', b2: 'x' } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

Run: `npx vitest run lib/grading/response.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the schema module**

Create `lib/grading/response.ts`:

```ts
import { z } from 'zod';

export const ResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mc'),           choice_id: z.string().nullable() }),
  z.object({ type: z.literal('ma'),           choice_ids: z.array(z.string()) }),
  z.object({ type: z.literal('tf'),           value: z.boolean().nullable() }),
  z.object({ type: z.literal('numeric'),      value: z.string() }),
  z.object({ type: z.literal('short_answer'), value: z.string() }),
  z.object({ type: z.literal('fill_in'),      blanks: z.record(z.string(), z.string()) }),
]);

export type Response = z.infer<typeof ResponseSchema>;

/** Treats a response as "empty" (unanswered). Used by grading + UI. */
export function isResponseEmpty(r: Response | null): boolean {
  if (r == null) return true;
  switch (r.type) {
    case 'mc':           return r.choice_id == null;
    case 'ma':           return r.choice_ids.length === 0;
    case 'tf':           return r.value == null;
    case 'numeric':      return r.value.trim() === '';
    case 'short_answer': return r.value.trim() === '';
    case 'fill_in':      return Object.values(r.blanks).every((v) => (v ?? '').trim() === '');
  }
}
```

- [ ] **Step 4: Run (expect PASS)**

Run: `npx vitest run lib/grading/response.test.ts`
Expected: PASS, 13/13.

- [ ] **Step 5: Commit**

```bash
git add lib/grading/response.ts lib/grading/response.test.ts
git commit -m "feat(grading): add Response discriminated union + zod schemas"
```

---

### Task 7: gradeAnswer dispatcher (TDD, table-driven)

**Files:**

- Create: `lib/grading/grade.ts`
- Create: `lib/grading/grade.test.ts`

**Why:** Single entry point for auto-grading. Pure function of `(snapshot, response)`. Never throws — wraps unexpected errors into `auto_error`.

- [ ] **Step 1: Write the failing test**

Create `lib/grading/grade.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gradeAnswer } from './grade';
import type { AnswerSnapshot } from './snapshot';

function snap(grading_target: AnswerSnapshot['render']['grading_target'], type: AnswerSnapshot['question_type'], body: AnswerSnapshot['render']['rendered_body'] = { kind: 'tf' } as any): AnswerSnapshot {
  return {
    question_id: 'q',
    question_type: type,
    seed: 0,
    rendered_at: '2026-05-26T00:00:00Z',
    render: {
      materialized_values: {},
      rendered_stem: 'stem',
      rendered_body: body,
      grading_target,
      validation_errors: [],
    },
  };
}

describe('gradeAnswer — mc', () => {
  const s = snap({ kind: 'mc', correct_id: 'b' }, 'mc', { kind: 'mc', choices: [{id:'a',label_substituted:'A'},{id:'b',label_substituted:'B'}] });
  it('scores 1 for matching choice', () => {
    expect(gradeAnswer(s, { type: 'mc', choice_id: 'b' })).toEqual({ ok: true, auto_score: 1, score_method: 'auto' });
  });
  it('scores 0 for wrong choice', () => {
    expect(gradeAnswer(s, { type: 'mc', choice_id: 'a' })).toEqual({ ok: true, auto_score: 0, score_method: 'auto' });
  });
  it('scores 0 for null choice (unanswered)', () => {
    expect(gradeAnswer(s, { type: 'mc', choice_id: null })).toEqual({ ok: true, auto_score: 0, score_method: 'auto' });
  });
  it('scores 0 for null response', () => {
    expect(gradeAnswer(s, null)).toEqual({ ok: true, auto_score: 0, score_method: 'auto' });
  });
});

describe('gradeAnswer — ma strict', () => {
  const s = snap({ kind: 'ma', correct_ids: ['a','c'], partial_credit: false }, 'ma',
    { kind: 'ma', choices: [{id:'a',label_substituted:'A'},{id:'b',label_substituted:'B'},{id:'c',label_substituted:'C'}] });
  it('1 when set equals', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a','c'] }).auto_score).toBe(1);
  });
  it('0 when subset', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a'] }).auto_score).toBe(0);
  });
  it('0 when superset', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a','b','c'] }).auto_score).toBe(0);
  });
  it('0 when disjoint', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['b'] }).auto_score).toBe(0);
  });
});

describe('gradeAnswer — ma partial credit', () => {
  const s = snap({ kind: 'ma', correct_ids: ['a','c'], partial_credit: true }, 'ma',
    { kind: 'ma', choices: [{id:'a',label_substituted:'A'},{id:'b',label_substituted:'B'},{id:'c',label_substituted:'C'}] });
  it('1.0 when all correct picked, none wrong', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a','c'] }).auto_score).toBe(1);
  });
  it('0.5 when half correct picked', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a'] }).auto_score).toBe(0.5);
  });
  it('0 when one wrong cancels one right', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a','b'] }).auto_score).toBe(0);
  });
  it('floors at 0 when wrongs exceed rights', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['b'] }).auto_score).toBe(0);
  });
});

describe('gradeAnswer — tf', () => {
  const s = snap({ kind: 'tf', correct: true }, 'tf');
  it('1 on match', () => {
    expect(gradeAnswer(s, { type: 'tf', value: true }).auto_score).toBe(1);
  });
  it('0 on mismatch', () => {
    expect(gradeAnswer(s, { type: 'tf', value: false }).auto_score).toBe(0);
  });
  it('0 on null (unanswered)', () => {
    expect(gradeAnswer(s, { type: 'tf', value: null }).auto_score).toBe(0);
  });
});

describe('gradeAnswer — numeric', () => {
  const s = snap({ kind: 'numeric', value: 4.5, tolerance: 0.01 }, 'numeric', { kind: 'numeric' });
  it('1 within tolerance', () => {
    expect(gradeAnswer(s, { type: 'numeric', value: '4.505' }).auto_score).toBe(1);
  });
  it('0 outside tolerance', () => {
    expect(gradeAnswer(s, { type: 'numeric', value: '4.6' }).auto_score).toBe(0);
  });
  it('auto_error on unparseable', () => {
    const out = gradeAnswer(s, { type: 'numeric', value: 'not a number' });
    expect(out).toMatchObject({ ok: false, auto_score: 0, score_method: 'auto_error' });
  });
  it('empty string → 0, no error', () => {
    expect(gradeAnswer(s, { type: 'numeric', value: '' })).toEqual({ ok: true, auto_score: 0, score_method: 'auto' });
  });
});

describe('gradeAnswer — short_answer', () => {
  const s = snap({ kind: 'short_answer', pattern: '^NaCl$', case_insensitive: true }, 'short_answer', { kind: 'short_answer' });
  it('1 on match (case-insensitive)', () => {
    expect(gradeAnswer(s, { type: 'short_answer', value: 'nacl' }).auto_score).toBe(1);
  });
  it('0 on mismatch', () => {
    expect(gradeAnswer(s, { type: 'short_answer', value: 'KCl' }).auto_score).toBe(0);
  });
  it('0 on empty (no error)', () => {
    expect(gradeAnswer(s, { type: 'short_answer', value: '   ' })).toEqual({ ok: true, auto_score: 0, score_method: 'auto' });
  });
  it('auto_error on invalid regex (defense)', () => {
    const bad = snap({ kind: 'short_answer', pattern: '([', case_insensitive: false }, 'short_answer', { kind: 'short_answer' });
    expect(gradeAnswer(bad, { type: 'short_answer', value: 'x' }).ok).toBe(false);
  });
});

describe('gradeAnswer — fill_in', () => {
  const s = snap({ kind: 'fill_in', targets: [
    { id: 'b1', target: 'NaCl', case_insensitive: true },
    { id: 'b2', target: '58.44', case_insensitive: false },
  ]}, 'fill_in', { kind: 'fill_in', blanks: [{ id: 'b1' }, { id: 'b2' }] });
  it('1 when all blanks match', () => {
    expect(gradeAnswer(s, { type: 'fill_in', blanks: { b1: 'NaCl', b2: '58.44' } }).auto_score).toBe(1);
  });
  it('0.5 when one of two blanks match', () => {
    expect(gradeAnswer(s, { type: 'fill_in', blanks: { b1: 'nacl', b2: 'wrong' } }).auto_score).toBe(0.5);
  });
  it('0 when no blanks match', () => {
    expect(gradeAnswer(s, { type: 'fill_in', blanks: { b1: 'x', b2: 'y' } }).auto_score).toBe(0);
  });
  it('missing blank entry → 0 for that blank', () => {
    expect(gradeAnswer(s, { type: 'fill_in', blanks: { b1: 'NaCl' } }).auto_score).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

Run: `npx vitest run lib/grading/grade.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the grader**

Create `lib/grading/grade.ts`:

```ts
import type { AnswerSnapshot } from './snapshot';
import type { Response } from './response';
import { isResponseEmpty } from './response';

export type GradeResult =
  | { ok: true;  auto_score: number; score_method: 'auto' }
  | { ok: false; auto_score: 0;      score_method: 'auto_error'; error: string };

function ok(score: number): GradeResult { return { ok: true, auto_score: score, score_method: 'auto' }; }
function err(message: string): GradeResult { return { ok: false, auto_score: 0, score_method: 'auto_error', error: message }; }

export function gradeAnswer(snapshot: AnswerSnapshot, response: Response | null): GradeResult {
  try {
    if (isResponseEmpty(response)) return ok(0);
    const target = snapshot.render.grading_target;

    switch (target.kind) {
      case 'mc': {
        if (response!.type !== 'mc') return err('response type mismatch');
        return ok(response!.choice_id === target.correct_id ? 1 : 0);
      }

      case 'ma': {
        if (response!.type !== 'ma') return err('response type mismatch');
        const picks = new Set(response!.choice_ids);
        const correct = new Set(target.correct_ids);
        const total_correct = correct.size;
        const total_choices = snapshot.render.rendered_body.kind === 'ma'
          ? snapshot.render.rendered_body.choices.length : 0;
        const total_wrong = Math.max(0, total_choices - total_correct);

        if (!target.partial_credit) {
          const sameSize = picks.size === correct.size;
          const allMatch = [...picks].every((id) => correct.has(id));
          return ok(sameSize && allMatch ? 1 : 0);
        }

        const correct_picks = [...picks].filter((id) => correct.has(id)).length;
        const wrong_picks   = [...picks].filter((id) => !correct.has(id)).length;
        const rightScore = total_correct > 0 ? correct_picks / total_correct : 0;
        const wrongScore = total_wrong   > 0 ? wrong_picks   / total_wrong   : 0;
        return ok(Math.max(0, rightScore - wrongScore));
      }

      case 'tf': {
        if (response!.type !== 'tf') return err('response type mismatch');
        return ok(response!.value === target.correct ? 1 : 0);
      }

      case 'numeric': {
        if (response!.type !== 'numeric') return err('response type mismatch');
        const parsed = Number(response!.value.trim());
        if (!Number.isFinite(parsed)) return err('unparseable response');
        return ok(Math.abs(parsed - target.value) <= target.tolerance ? 1 : 0);
      }

      case 'short_answer': {
        if (response!.type !== 'short_answer') return err('response type mismatch');
        let re: RegExp;
        try {
          re = new RegExp(target.pattern, target.case_insensitive ? 'i' : '');
        } catch {
          return err('invalid pattern');
        }
        return ok(re.test(response!.value.trim()) ? 1 : 0);
      }

      case 'fill_in': {
        if (response!.type !== 'fill_in') return err('response type mismatch');
        const targets = target.targets;
        if (targets.length === 0) return ok(0);
        let correct_count = 0;
        for (const t of targets) {
          const raw = (response!.blanks[t.id] ?? '').trim();
          const expected = t.target;
          const matches = t.case_insensitive
            ? raw.toLowerCase() === expected.toLowerCase()
            : raw === expected;
          if (matches) correct_count++;
        }
        return ok(correct_count / targets.length);
      }
    }
  } catch (e) {
    return err(`unexpected: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: Run (expect PASS)**

Run: `npx vitest run lib/grading/grade.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add lib/grading/grade.ts lib/grading/grade.test.ts
git commit -m "feat(grading): add gradeAnswer dispatcher with per-type rules"
```

---

### Task 8: Attempt summary rollup (TDD)

**Files:**

- Create: `lib/grading/summary.ts`
- Create: `lib/grading/summary.test.ts`
- Modify: `lib/grading/index.ts` (barrel exports)

- [ ] **Step 1: Write the failing test**

Create `lib/grading/summary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeAttemptSummary } from './summary';
import type { GradeResult } from './grade';

const ok = (score: number): GradeResult => ({ ok: true, auto_score: score, score_method: 'auto' });

describe('computeAttemptSummary', () => {
  it('sums per-question scores and computes percentage', () => {
    const s = computeAttemptSummary([ok(1), ok(0.5), ok(0)]);
    expect(s).toEqual({ raw_score: 1.5, max_score: 3, percentage: 50 });
  });
  it('rounds percentage to 2 decimal places', () => {
    const s = computeAttemptSummary([ok(1), ok(1), ok(0)]);
    expect(s.percentage).toBeCloseTo(66.67, 2);
  });
  it('empty attempt summary', () => {
    expect(computeAttemptSummary([])).toEqual({ raw_score: 0, max_score: 0, percentage: 0 });
  });
  it('treats auto_error as 0 score (still counts toward max)', () => {
    const s = computeAttemptSummary([
      ok(1),
      { ok: false, auto_score: 0, score_method: 'auto_error', error: 'x' },
    ]);
    expect(s).toEqual({ raw_score: 1, max_score: 2, percentage: 50 });
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

Run: `npx vitest run lib/grading/summary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `lib/grading/summary.ts`:

```ts
import type { GradeResult } from './grade';

export type AttemptSummary = {
  raw_score: number;
  max_score: number;
  percentage: number;  // 0..100, rounded to 2 decimals
};

export function computeAttemptSummary(results: readonly GradeResult[]): AttemptSummary {
  const max_score = results.length;
  const raw_score = results.reduce((sum, r) => sum + r.auto_score, 0);
  const pct = max_score > 0 ? (raw_score / max_score) * 100 : 0;
  return {
    raw_score,
    max_score,
    percentage: Math.round(pct * 100) / 100,
  };
}
```

- [ ] **Step 4: Update barrel**

Modify `lib/grading/index.ts`. Append (or merge into) the existing exports:

```ts
export * from './snapshot';
export * from './response';
export * from './grade';
export * from './summary';
```

- [ ] **Step 5: Run + full test**

Run: `npx vitest run lib/grading/summary.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/grading/summary.ts lib/grading/summary.test.ts lib/grading/index.ts
git commit -m "feat(grading): add computeAttemptSummary + barrel exports"
```

---

### Task 9: Auth helpers — requireStudent / requireInstructor

**Files:**

- Create: `lib/auth/require.ts`
- Create: `lib/auth/require.test.ts`

**Why:** Defense-in-depth on Server Actions. Plan 2 deferred this until action count grew (`tech-gotchas.md`); Plan 3 is the natural moment.

- [ ] **Step 1: Write the failing test**

Create `lib/auth/require.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));

// Mock the Supabase server client
const getUserMock = vi.fn();
const fromMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

import { requireStudent, requireInstructor } from './require';

function userRow(role: 'student' | 'instructor') {
  return { data: { role }, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireStudent', () => {
  it('returns user + role for an authenticated student', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => userRow('student') }) }),
    });
    const out = await requireStudent();
    expect(out.user.id).toBe('u1');
    expect(out.role).toBe('student');
  });

  it('returns user + role for an instructor (instructors can take quizzes)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u2' } }, error: null });
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => userRow('instructor') }) }),
    });
    const out = await requireStudent();
    expect(out.role).toBe('instructor');
  });

  it('redirects to /sign-in when unauthenticated', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(requireStudent()).rejects.toThrow('REDIRECT:/sign-in');
  });
});

describe('requireInstructor', () => {
  it('returns user when role=instructor', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'i1' } }, error: null });
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => userRow('instructor') }) }),
    });
    const out = await requireInstructor();
    expect(out.user.id).toBe('i1');
  });

  it('notFound() when role=student (do not reveal route shape)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 's1' } }, error: null });
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => userRow('student') }) }),
    });
    await expect(requireInstructor()).rejects.toThrow('NOT_FOUND');
  });

  it('redirects to /sign-in when unauthenticated', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(requireInstructor()).rejects.toThrow('REDIRECT:/sign-in');
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

Run: `npx vitest run lib/auth/require.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the helpers**

Create `lib/auth/require.ts`:

```ts
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

export type AuthedUser = { user: User; role: 'student' | 'instructor' };

/**
 * Gate for student-facing Server Actions + RSC pages.
 * Instructors are allowed (so they can dogfood quizzes); only unauthenticated
 * callers and rows with an unexpected role bounce.
 */
export async function requireStudent(): Promise<AuthedUser> {
  const supabase = createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/sign-in');

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', auth.user.id)
    .single();

  if (error || !data) redirect('/sign-in');
  if (data.role !== 'student' && data.role !== 'instructor') notFound();

  return { user: auth.user, role: data.role };
}

/**
 * Gate for instructor-only Server Actions + RSC pages.
 * Students get notFound() so the route shape isn't probeable.
 */
export async function requireInstructor(): Promise<{ user: User }> {
  const supabase = createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/sign-in');

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', auth.user.id)
    .single();

  if (error || !data) notFound();
  if (data.role !== 'instructor') notFound();

  return { user: auth.user };
}
```

- [ ] **Step 4: Run (expect PASS)**

Run: `npx vitest run lib/auth/require.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/require.ts lib/auth/require.test.ts
git commit -m "feat(auth): add requireStudent + requireInstructor helpers"
```

---

### Task 10: Add shadcn alert-dialog

**Files:**

- Create: `components/ui/alert-dialog.tsx`

**Why:** Submit-confirmation modal in the attempt page.

- [ ] **Step 1: Add component**

Run: `npx --yes shadcn@latest add alert-dialog`

Expected: one file written under `components/ui/alert-dialog.tsx`, inheriting the `radix-nova` style.

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/ui/alert-dialog.tsx
git commit -m "feat(ui): add shadcn alert-dialog for submit confirmation"
```

---

### Task 11: AnswerSurface controlled-mode refactor

**Files:**

- Modify: `components/preview/answer-surfaces.tsx`
- Create: `components/preview/answer-surfaces.test.tsx`

**Why:** Plan 2's surfaces hold local state via `useState`. Plan 3 needs them controlled by a parent (the attempt page) and read-only on the result page. Backward-compatible: when no `value`/`onChange` is passed, surface falls back to uncontrolled (Plan 2 preview keeps working).

- [ ] **Step 1: Read the current file**

Read `components/preview/answer-surfaces.tsx` (already covered in plan context) to confirm the current 6-surface dispatcher pattern.

- [ ] **Step 2: Rewrite the file**

Replace `components/preview/answer-surfaces.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { Markdown } from '@/lib/rendering';
import { Input } from '@/components/ui/input';
import type { RenderedBody } from '@/lib/rendering';
import type { Response } from '@/lib/grading';

type ControlledProps = {
  value?: Response | null;
  onChange?: (next: Response) => void;
  disabled?: boolean;
};

export function AnswerSurface({
  body,
  ...controlled
}: { body: RenderedBody } & ControlledProps) {
  const key = JSON.stringify(body);
  switch (body.kind) {
    case 'mc':
      return <McSurface key={key} body={body} {...controlled} />;
    case 'ma':
      return <MaSurface key={key} body={body} {...controlled} />;
    case 'tf':
      return <TfSurface key={key} {...controlled} />;
    case 'numeric':
      return <NumericSurface key={key} body={body} {...controlled} />;
    case 'short_answer':
      return <ShortAnswerSurface key={key} {...controlled} />;
    case 'fill_in':
      return <FillInSurface key={key} body={body} {...controlled} />;
  }
}

function isControlled(p: ControlledProps): boolean {
  return p.value !== undefined && p.onChange !== undefined;
}

function McSurface({
  body, value, onChange, disabled,
}: { body: Extract<RenderedBody, { kind: 'mc' }> } & ControlledProps) {
  const [local, setLocal] = useState<string | null>(null);
  const controlled = isControlled({ value, onChange });
  const picked = controlled ? (value as Response & { type: 'mc' })?.choice_id ?? null : local;
  const set = (id: string) => {
    if (controlled) onChange!({ type: 'mc', choice_id: id });
    else setLocal(id);
  };
  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend className="sr-only">Answer</legend>
      {body.choices.map((c) => (
        <label key={c.id} className="flex items-center gap-2">
          <input
            type="radio"
            name={`mc-${body.choices[0]?.id ?? 'x'}`}
            checked={picked === c.id}
            onChange={() => set(c.id)}
            disabled={disabled}
          />
          <Markdown source={c.label_substituted} />
        </label>
      ))}
    </fieldset>
  );
}

function MaSurface({
  body, value, onChange, disabled,
}: { body: Extract<RenderedBody, { kind: 'ma' }> } & ControlledProps) {
  const [local, setLocal] = useState<Set<string>>(new Set());
  const controlled = isControlled({ value, onChange });
  const picked = controlled
    ? new Set((value as Response & { type: 'ma' })?.choice_ids ?? [])
    : local;

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (controlled) onChange!({ type: 'ma', choice_ids: [...next] });
    else setLocal(next);
  };

  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend className="sr-only">Pick all that apply</legend>
      {body.choices.map((c) => (
        <label key={c.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={picked.has(c.id)}
            onChange={() => toggle(c.id)}
            disabled={disabled}
          />
          <Markdown source={c.label_substituted} />
        </label>
      ))}
    </fieldset>
  );
}

function TfSurface({ value, onChange, disabled }: ControlledProps) {
  const [local, setLocal] = useState<boolean | null>(null);
  const controlled = isControlled({ value, onChange });
  const v = controlled ? (value as Response & { type: 'tf' })?.value ?? null : local;
  const set = (b: boolean) => {
    if (controlled) onChange!({ type: 'tf', value: b });
    else setLocal(b);
  };
  return (
    <fieldset className="flex items-center gap-4" disabled={disabled}>
      <legend className="sr-only">Answer</legend>
      <label className="flex items-center gap-2">
        <input type="radio" name="tf" checked={v === true} onChange={() => set(true)} disabled={disabled} /> True
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" name="tf" checked={v === false} onChange={() => set(false)} disabled={disabled} /> False
      </label>
    </fieldset>
  );
}

function NumericSurface({
  body, value, onChange, disabled,
}: { body: Extract<RenderedBody, { kind: 'numeric' }> } & ControlledProps) {
  const [local, setLocal] = useState('');
  const controlled = isControlled({ value, onChange });
  const v = controlled ? (value as Response & { type: 'numeric' })?.value ?? '' : local;
  const set = (s: string) => {
    if (controlled) onChange!({ type: 'numeric', value: s });
    else setLocal(s);
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        step="any"
        value={v}
        onChange={(e) => set(e.target.value)}
        className="w-40"
        aria-label="Numeric answer"
        disabled={disabled}
      />
      {body.units && <span className="text-muted-foreground text-sm">{body.units}</span>}
    </div>
  );
}

function ShortAnswerSurface({ value, onChange, disabled }: ControlledProps) {
  const [local, setLocal] = useState('');
  const controlled = isControlled({ value, onChange });
  const v = controlled ? (value as Response & { type: 'short_answer' })?.value ?? '' : local;
  const set = (s: string) => {
    if (controlled) onChange!({ type: 'short_answer', value: s });
    else setLocal(s);
  };
  return <Input value={v} onChange={(e) => set(e.target.value)} aria-label="Short answer" disabled={disabled} />;
}

function FillInSurface({
  body, value, onChange, disabled,
}: { body: Extract<RenderedBody, { kind: 'fill_in' }> } & ControlledProps) {
  const [local, setLocal] = useState<Record<string, string>>({});
  const controlled = isControlled({ value, onChange });
  const vals = controlled
    ? (value as Response & { type: 'fill_in' })?.blanks ?? {}
    : local;
  const set = (id: string, s: string) => {
    const next = { ...vals, [id]: s };
    if (controlled) onChange!({ type: 'fill_in', blanks: next });
    else setLocal(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {body.blanks.map((b) => (
        <label key={b.id} className="flex items-center gap-2">
          <span className="w-24 font-mono text-xs">{b.id}</span>
          <Input
            value={vals[b.id] ?? ''}
            onChange={(e) => set(b.id, e.target.value)}
            placeholder={b.prompt}
            disabled={disabled}
            aria-label={`Blank ${b.id}`}
          />
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write a smoke test that exercises both modes**

Create `components/preview/answer-surfaces.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnswerSurface } from './answer-surfaces';
import type { RenderedBody } from '@/lib/rendering';

const mcBody: RenderedBody = { kind: 'mc', choices: [
  { id: 'a', label_substituted: 'Alpha' },
  { id: 'b', label_substituted: 'Beta' },
]};

describe('AnswerSurface — uncontrolled (Plan 2 preview path)', () => {
  it('renders without controlled props and tracks local state', () => {
    render(<AnswerSurface body={mcBody} />);
    const radioA = screen.getByLabelText('Alpha') as HTMLInputElement;
    fireEvent.click(radioA);
    expect(radioA.checked).toBe(true);
  });
});

describe('AnswerSurface — controlled', () => {
  it('reflects external value and calls onChange', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AnswerSurface body={mcBody} value={{ type: 'mc', choice_id: 'a' }} onChange={onChange} />
    );
    expect((screen.getByLabelText('Alpha') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Beta'));
    expect(onChange).toHaveBeenCalledWith({ type: 'mc', choice_id: 'b' });

    rerender(
      <AnswerSurface body={mcBody} value={{ type: 'mc', choice_id: 'b' }} onChange={onChange} />
    );
    expect((screen.getByLabelText('Beta') as HTMLInputElement).checked).toBe(true);
  });

  it('disabled prop disables inputs', () => {
    render(
      <AnswerSurface body={mcBody} value={{ type: 'mc', choice_id: 'a' }} onChange={() => {}} disabled />
    );
    expect((screen.getByLabelText('Alpha') as HTMLInputElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 4: Run vitest**

Run: `npm test -- --run`
Expected: PASS. All Plan 2 preview specs continue to pass; new surface tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/preview/answer-surfaces.tsx components/preview/answer-surfaces.test.tsx
git commit -m "refactor(preview): add controlled mode + disabled to AnswerSurface"
```

---

### Task 12: startAttemptAction Server Action

**Files:**

- Create: `app/(student)/take/[id]/actions.ts`
- Create: `app/(student)/take/[id]/page.tsx`

**Why:** Entry route for taking an assessment. Reads existing in-progress attempt (resume) or starts a new one via the SECURITY DEFINER `start_attempt` function with eager snapshot capture.

- [ ] **Step 1: Write the action**

Create `app/(student)/take/[id]/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStudent } from '@/lib/auth/require';
import { buildSnapshot } from '@/lib/grading';

export type StartResult =
  | { ok: true;  attemptId: string }
  | { ok: false; error: 'not_published' | 'closed' | 'no_attempts_remaining' | 'unknown'; message?: string };

export async function startAttemptAction(assessmentId: string): Promise<StartResult> {
  const { user } = await requireStudent();
  const supabase = createServerSupabaseClient();

  // 1. Load assessment (RLS already filters to rows the student can see).
  const { data: assessment, error: aErr } = await supabase
    .from('assessments')
    .select('id, status, default_attempts, opens_at, closes_at')
    .eq('id', assessmentId)
    .maybeSingle();
  if (aErr || !assessment) return { ok: false, error: 'not_published' };
  if (assessment.status !== 'published') return { ok: false, error: 'not_published' };

  const now = new Date();
  if (assessment.opens_at && new Date(assessment.opens_at) > now) return { ok: false, error: 'closed' };
  if (assessment.closes_at && new Date(assessment.closes_at) < now) return { ok: false, error: 'closed' };

  // 2. Resume in-progress attempt if any.
  const { data: inProg } = await supabase
    .from('attempts')
    .select('id')
    .eq('assessment_id', assessmentId)
    .eq('student_user_id', user.id)
    .eq('status', 'in_progress')
    .maybeSingle();
  if (inProg) return { ok: true, attemptId: inProg.id };

  // 3. Apply attempts cap (default + override).
  const { data: override } = await supabase
    .from('assessment_overrides')
    .select('extra_attempts')
    .eq('assessment_id', assessmentId)
    .eq('student_user_id', user.id)
    .maybeSingle();
  const maxAttempts = (assessment.default_attempts ?? 1) + (override?.extra_attempts ?? 0);

  const { count: submittedCount, error: cErr } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId)
    .eq('student_user_id', user.id)
    .eq('status', 'submitted');
  if (cErr) return { ok: false, error: 'unknown', message: cErr.message };
  const attemptNo = (submittedCount ?? 0) + 1;
  if (attemptNo > maxAttempts) return { ok: false, error: 'no_attempts_remaining' };

  // 4. Compute seed.
  // Reuses Plan 2's stableSeed: stableSeed(student_id, assessment_id, attempt_no)
  const { stableSeed } = await import('@/lib/materializer');
  const seed = stableSeed(user.id, assessmentId, attemptNo);

  // 5. Load questions + variables.
  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('id, type, body, scoring, position, question_variables(id, name, spec)')
    .eq('assessment_id', assessmentId)
    .order('position', { ascending: true });
  if (qErr || !questions) return { ok: false, error: 'unknown', message: qErr?.message };

  // 6. Build snapshots.
  const snapshots = questions.map((q) => ({
    question_id: q.id,
    snapshot: buildSnapshot({
      question: {
        id: q.id,
        type: q.type,
        body: q.body as Record<string, unknown>,
        scoring: q.scoring as Record<string, unknown>,
        variables: (q.question_variables ?? []).map((v) => ({
          name: v.name,
          type: (v.spec as { type: string }).type as 'choice' | 'chemistry_compound' | 'randint' | 'randfloat' | 'derived',
          spec: v.spec as Record<string, unknown>,
        })),
      },
      seed,
    }),
  }));

  // 7. Call SECURITY DEFINER helper to atomically insert attempt + N answers.
  const { data: newId, error: sErr } = await supabase.rpc('start_attempt', {
    p_assessment_id: assessmentId,
    p_student_user_id: user.id,
    p_attempt_no: attemptNo,
    p_seed: seed,
    p_snapshots: snapshots,
  });
  if (sErr || !newId) return { ok: false, error: 'unknown', message: sErr?.message };

  return { ok: true, attemptId: newId as string };
}

/** Server Component entry helper — used from /take/[id]/page.tsx to handle the redirect. */
export async function startOrResumeAndRedirect(assessmentId: string): Promise<never> {
  const result = await startAttemptAction(assessmentId);
  if (result.ok) {
    redirect(`/attempts/${result.attemptId}` as Route);
  }
  // Non-OK: caller renders an error page from result.error
  throw new Error(`start_failed:${result.error}`);
}
```

- [ ] **Step 2: Write the entry route**

Create `app/(student)/take/[id]/page.tsx`:

```tsx
import { startAttemptAction } from './actions';
import { redirect } from 'next/navigation';
import type { Route } from 'next';

type Props = { params: Promise<{ id: string }> };

export default async function TakeEntryPage({ params }: Props) {
  const { id } = await params;
  const result = await startAttemptAction(id);

  if (result.ok) {
    redirect(`/attempts/${result.attemptId}` as Route);
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Can&apos;t start attempt</h1>
      <p className="mt-2 text-muted-foreground">
        {result.error === 'not_published' && 'This assessment is not available.'}
        {result.error === 'closed' && 'This assessment is not open at this time.'}
        {result.error === 'no_attempts_remaining' && 'You have used all available attempts.'}
        {result.error === 'unknown' && (result.message ?? 'An unexpected error occurred.')}
      </p>
      <a href="/" className="mt-4 inline-block text-sm underline">← Back to home</a>
    </main>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (If `start_attempt` is missing from the regenerated `database.ts`, re-run `npm run db:types` — RPCs land under `Database['public']['Functions']`.)

- [ ] **Step 4: Commit**

```bash
git add app/\(student\)/
git commit -m "feat(student): add /take/[id] entry route + startAttemptAction"
```

---

### Task 13: saveAnswerAction Server Action

**Files:**

- Create: `app/(student)/attempts/[aid]/actions.ts` (partial — submitAttemptAction added in Task 14)

- [ ] **Step 1: Write the action**

Create `app/(student)/attempts/[aid]/actions.ts`:

```ts
'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStudent } from '@/lib/auth/require';
import { ResponseSchema, type Response } from '@/lib/grading';

export type SaveResult =
  | { ok: true }
  | { ok: false; error: 'not_yours' | 'already_submitted' | 'invalid_response' | 'unknown'; message?: string };

export async function saveAnswerAction(input: {
  attemptId: string;
  questionId: string;
  response: Response;
}): Promise<SaveResult> {
  const { user } = await requireStudent();

  const parsed = ResponseSchema.safeParse(input.response);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_response', message: parsed.error.message };
  }

  const supabase = createServerSupabaseClient();

  // Verify attempt is still in-progress AND owned. RLS scopes the SELECT.
  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .select('status, student_user_id')
    .eq('id', input.attemptId)
    .maybeSingle();
  if (aErr || !attempt) return { ok: false, error: 'not_yours' };
  if (attempt.student_user_id !== user.id) return { ok: false, error: 'not_yours' };
  if (attempt.status !== 'in_progress') return { ok: false, error: 'already_submitted' };

  // UPDATE answers (RLS via student_owns_in_progress_attempt gates it).
  const { data: updated, error: uErr } = await supabase
    .from('answers')
    .update({ response: parsed.data as unknown as Record<string, unknown> })
    .eq('attempt_id', input.attemptId)
    .eq('question_id', input.questionId)
    .select('id');
  if (uErr) return { ok: false, error: 'unknown', message: uErr.message };
  if (!updated || updated.length === 0) return { ok: false, error: 'not_yours' };

  // No revalidatePath — autosave is hot path.
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/\(student\)/attempts/\[aid\]/actions.ts
git commit -m "feat(student): add saveAnswerAction for per-question autosave"
```

---

### Task 14: submitAttemptAction Server Action

**Files:**

- Modify: `app/(student)/attempts/[aid]/actions.ts`

- [ ] **Step 1: Append the submit action**

Append to `app/(student)/attempts/[aid]/actions.ts`:

```ts
import { revalidatePath } from 'next/cache';
import { gradeAnswer, computeAttemptSummary, type AnswerSnapshot } from '@/lib/grading';
import type { GradeResult } from '@/lib/grading';

export type SubmitResult =
  | { ok: true;  summary: { raw_score: number; max_score: number; percentage: number } }
  | { ok: false; error: 'not_yours' | 'already_submitted' | 'unknown'; message?: string };

export async function submitAttemptAction(attemptId: string): Promise<SubmitResult> {
  const { user } = await requireStudent();
  const supabase = createServerSupabaseClient();

  // Verify ownership + in-progress.
  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .select('status, student_user_id')
    .eq('id', attemptId)
    .maybeSingle();
  if (aErr || !attempt) return { ok: false, error: 'not_yours' };
  if (attempt.student_user_id !== user.id) return { ok: false, error: 'not_yours' };
  if (attempt.status !== 'in_progress') return { ok: false, error: 'already_submitted' };

  // Load all answer rows (snapshot + response).
  const { data: rows, error: rErr } = await supabase
    .from('answers')
    .select('question_id, rendered_question_snapshot, response')
    .eq('attempt_id', attemptId);
  if (rErr || !rows) return { ok: false, error: 'unknown', message: rErr?.message };

  // Grade each.
  const grades = rows.map((r) => {
    const snap = r.rendered_question_snapshot as unknown as AnswerSnapshot;
    const resp = (r.response ?? null) as Response | null;
    const result: GradeResult = gradeAnswer(snap, resp);
    return {
      question_id: r.question_id,
      auto_score: result.auto_score,
      score_method: result.score_method,
      result,
    };
  });

  // Compute summary.
  const summary = computeAttemptSummary(grades.map((g) => g.result));

  // Atomic submit via SECURITY DEFINER helper.
  const { error: sErr } = await supabase.rpc('submit_attempt', {
    p_attempt_id: attemptId,
    p_grades: grades.map((g) => ({
      question_id: g.question_id,
      auto_score: g.auto_score,
      score_method: g.score_method,
    })),
    p_summary: summary,
  });
  if (sErr) return { ok: false, error: 'unknown', message: sErr.message };

  // Revalidate the surfaces that depend on this attempt + the home page.
  revalidatePath(`/attempts/${attemptId}`);
  revalidatePath(`/attempts/${attemptId}/result`);
  revalidatePath('/');

  return { ok: true, summary };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/\(student\)/attempts/\[aid\]/actions.ts
git commit -m "feat(student): add submitAttemptAction with sync auto-grade + summary"
```

---

### Task 15: useAutosave hook (TDD)

**Files:**

- Create: `components/attempt/use-autosave.ts`
- Create: `components/attempt/use-autosave.test.ts`

- [ ] **Step 1: Write the failing test**

Create `components/attempt/use-autosave.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutosave } from './use-autosave';
import type { Response } from '@/lib/grading';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useAutosave', () => {
  it('starts idle when nothing changes', () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useAutosave({
      attemptId: 'a', questionId: 'q', response: null, onSave,
    }));
    expect(result.current.status).toBe('idle');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('debounces saves on response change', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    const initialResponse: Response = { type: 'mc', choice_id: 'a' };
    const { result, rerender } = renderHook(
      ({ response }) => useAutosave({ attemptId: 'a', questionId: 'q', response, onSave, debounceMs: 500 }),
      { initialProps: { response: initialResponse } }
    );

    rerender({ response: { type: 'mc', choice_id: 'b' } });

    // Before debounce fires
    act(() => { vi.advanceTimersByTime(300); });
    expect(onSave).not.toHaveBeenCalled();

    // Debounce fires
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      attemptId: 'a', questionId: 'q', response: { type: 'mc', choice_id: 'b' },
    });
    await waitFor(() => expect(result.current.status).toBe('saved'));
  });

  it('reports error status on save failure', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, error: 'unknown' });
    const { result, rerender } = renderHook(
      ({ response }) => useAutosave({ attemptId: 'a', questionId: 'q', response, onSave, debounceMs: 100 }),
      { initialProps: { response: { type: 'mc', choice_id: 'a' } as Response } }
    );
    rerender({ response: { type: 'mc', choice_id: 'b' } });
    await act(async () => { vi.advanceTimersByTime(150); });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

Run: `npx vitest run components/attempt/use-autosave.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the hook**

Create `components/attempt/use-autosave.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import type { Response } from '@/lib/grading';
import type { SaveResult } from '@/app/(student)/attempts/[aid]/actions';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type UseAutosaveInput = {
  attemptId: string;
  questionId: string;
  response: Response | null;
  onSave: (input: { attemptId: string; questionId: string; response: Response }) => Promise<SaveResult>;
  debounceMs?: number;
};

export function useAutosave(input: UseAutosaveInput) {
  const { attemptId, questionId, response, onSave, debounceMs = 500 } = input;
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const inflightRef = useRef<Promise<SaveResult> | null>(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (response == null) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    setStatus('saving');
    timerRef.current = setTimeout(async () => {
      const p = onSave({ attemptId, questionId, response });
      inflightRef.current = p;
      const result = await p;
      if (inflightRef.current !== p) return;  // a newer save has started
      if (result.ok) {
        setStatus('saved');
        setLastSavedAt(new Date());
      } else {
        setStatus('error');
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [response, attemptId, questionId, onSave, debounceMs]);

  function retry() {
    if (response) {
      setStatus('saving');
      onSave({ attemptId, questionId, response }).then((r) => {
        setStatus(r.ok ? 'saved' : 'error');
        if (r.ok) setLastSavedAt(new Date());
      });
    }
  }

  return { status, lastSavedAt, retry };
}
```

- [ ] **Step 4: Run (expect PASS)**

Run: `npx vitest run components/attempt/use-autosave.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/attempt/use-autosave.ts components/attempt/use-autosave.test.ts
git commit -m "feat(attempt): add useAutosave hook with debounce + status tracking"
```

---

### Task 16: SubmitDialog + AttemptHeader + QuestionCard components

**Files:**

- Create: `components/attempt/SubmitDialog.tsx`
- Create: `components/attempt/AttemptHeader.tsx`
- Create: `components/attempt/QuestionCard.tsx`

**Why:** UI primitives for the attempt page client component. Splitting them out keeps `client.tsx` focused on orchestration.

- [ ] **Step 1: Write `SubmitDialog.tsx`**

Create `components/attempt/SubmitDialog.tsx`:

```tsx
'use client';

import {
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

export type SubmitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unansweredCount: number;
  unansweredLabels: string[];   // e.g. ['Q2', 'Q5']
  onConfirm: () => void;
  submitting: boolean;
};

export function SubmitDialog({
  open, onOpenChange, unansweredCount, unansweredLabels, onConfirm, submitting,
}: SubmitDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Submit attempt?</AlertDialogTitle>
        <AlertDialogDescription>
          {unansweredCount === 0
            ? 'This will end your attempt and reveal correct answers. Continue?'
            : `${unansweredCount} question${unansweredCount === 1 ? '' : 's'} unanswered: ${unansweredLabels.join(', ')}. They will be scored as 0. Submit anyway?`}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Submitting…' : (unansweredCount === 0 ? 'Submit' : 'Submit anyway')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Write `AttemptHeader.tsx`**

Create `components/attempt/AttemptHeader.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import type { AutosaveStatus } from './use-autosave';

export type AttemptHeaderProps = {
  title: string;
  attemptNo: number;
  maxAttempts: number;
  overallStatus: AutosaveStatus;     // worst-of across cards
  lastSavedAt: Date | null;
  onSubmit: () => void;
  submitDisabled: boolean;
};

function indicatorLabel(s: AutosaveStatus, lastSavedAt: Date | null): string {
  if (s === 'saving') return 'Saving…';
  if (s === 'error')  return 'Save failed';
  if (s === 'saved' && lastSavedAt) return `Saved ${secondsAgo(lastSavedAt)}s ago`;
  return 'Saved';
}

function secondsAgo(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
}

export function AttemptHeader(p: AttemptHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold">{p.title}</h1>
        <p className="text-xs text-muted-foreground">
          Attempt {p.attemptNo} of {p.maxAttempts} · {indicatorLabel(p.overallStatus, p.lastSavedAt)}
        </p>
      </div>
      <Button onClick={p.onSubmit} disabled={p.submitDisabled}>Submit attempt</Button>
    </div>
  );
}
```

- [ ] **Step 3: Write `QuestionCard.tsx`**

Create `components/attempt/QuestionCard.tsx`:

```tsx
'use client';

import { Markdown } from '@/lib/rendering';
import { AnswerSurface } from '@/components/preview/answer-surfaces';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { AnswerSnapshot, Response } from '@/lib/grading';

export type QuestionCardProps = {
  position: number;
  snapshot: AnswerSnapshot;
  response: Response | null;
  onChange: (r: Response) => void;
  anchor?: string;
};

export function QuestionCard({ position, snapshot, response, onChange, anchor }: QuestionCardProps) {
  return (
    <Card id={anchor} className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">Q{position + 1}</h2>
        <Badge variant="secondary">{snapshot.question_type}</Badge>
      </div>
      <div className="prose mb-3 max-w-none">
        <Markdown source={snapshot.render.rendered_stem} />
      </div>
      <AnswerSurface
        body={snapshot.render.rendered_body}
        value={response}
        onChange={onChange}
      />
    </Card>
  );
}
```

- [ ] **Step 4: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/attempt/SubmitDialog.tsx components/attempt/AttemptHeader.tsx components/attempt/QuestionCard.tsx
git commit -m "feat(attempt): add SubmitDialog, AttemptHeader, QuestionCard components"
```

---

### Task 17: Attempt page server shell + client component

**Files:**

- Create: `app/(student)/attempts/[aid]/page.tsx`
- Create: `app/(student)/attempts/[aid]/client.tsx`

- [ ] **Step 1: Write the server shell**

Create `app/(student)/attempts/[aid]/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStudent } from '@/lib/auth/require';
import { AttemptClient } from './client';
import type { AnswerSnapshot, Response } from '@/lib/grading';

type Props = { params: Promise<{ aid: string }> };

export default async function AttemptPage({ params }: Props) {
  const { aid } = await params;
  const { user } = await requireStudent();
  const supabase = createServerSupabaseClient();

  // Attempt + owning assessment metadata.
  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .select('id, status, attempt_no, student_user_id, assessment_id, assessments(id, title, default_attempts)')
    .eq('id', aid)
    .maybeSingle();
  if (aErr || !attempt) notFound();
  if (attempt.student_user_id !== user.id) notFound();
  if (attempt.status === 'submitted' || attempt.status === 'auto_submitted' || attempt.status === 'graded') {
    redirect(`/attempts/${aid}/result` as Route);
  }

  // Effective max attempts (default + override).
  const { data: override } = await supabase
    .from('assessment_overrides')
    .select('extra_attempts')
    .eq('assessment_id', attempt.assessment_id)
    .eq('student_user_id', user.id)
    .maybeSingle();
  const assessment = attempt.assessments as unknown as { id: string; title: string; default_attempts: number };
  const maxAttempts = (assessment.default_attempts ?? 1) + (override?.extra_attempts ?? 0);

  // All answer rows.
  const { data: answers, error: nErr } = await supabase
    .from('answers')
    .select('question_id, rendered_question_snapshot, response')
    .eq('attempt_id', aid);
  if (nErr || !answers) notFound();

  const cards = answers.map((row) => ({
    questionId: row.question_id,
    snapshot: row.rendered_question_snapshot as unknown as AnswerSnapshot,
    initialResponse: (row.response ?? null) as Response | null,
  }));

  // Sort by snapshot.question_type? No — by original questions.position.
  // Fetch positions once:
  const { data: qPos } = await supabase
    .from('questions')
    .select('id, position')
    .eq('assessment_id', attempt.assessment_id);
  const posByQid = new Map((qPos ?? []).map((q) => [q.id, q.position]));
  cards.sort((a, b) => (posByQid.get(a.questionId) ?? 0) - (posByQid.get(b.questionId) ?? 0));

  return (
    <AttemptClient
      attemptId={aid}
      title={assessment.title}
      attemptNo={attempt.attempt_no}
      maxAttempts={maxAttempts}
      cards={cards.map((c, i) => ({ ...c, position: i }))}
    />
  );
}
```

- [ ] **Step 2: Write the client component**

Create `app/(student)/attempts/[aid]/client.tsx`:

```tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { AttemptHeader } from '@/components/attempt/AttemptHeader';
import { QuestionCard } from '@/components/attempt/QuestionCard';
import { SubmitDialog } from '@/components/attempt/SubmitDialog';
import { useAutosave, type AutosaveStatus } from '@/components/attempt/use-autosave';
import { saveAnswerAction, submitAttemptAction } from './actions';
import { isResponseEmpty, type AnswerSnapshot, type Response } from '@/lib/grading';

type Card = {
  position: number;
  questionId: string;
  snapshot: AnswerSnapshot;
  initialResponse: Response | null;
};

type Props = {
  attemptId: string;
  title: string;
  attemptNo: number;
  maxAttempts: number;
  cards: Card[];
};

export function AttemptClient({ attemptId, title, attemptNo, maxAttempts, cards }: Props) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, Response | null>>(() => {
    const init: Record<string, Response | null> = {};
    for (const c of cards) init[c.questionId] = c.initialResponse;
    return init;
  });
  const [statuses, setStatuses] = useState<Record<string, AutosaveStatus>>({});
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onChange = useCallback((qid: string, next: Response) => {
    setResponses((prev) => ({ ...prev, [qid]: next }));
  }, []);

  // We can't call useAutosave per card in a loop, so each QuestionCardWrapper instantiates its own.
  const overallStatus: AutosaveStatus = useMemo(() => {
    const vals = Object.values(statuses);
    if (vals.includes('error'))  return 'error';
    if (vals.includes('saving')) return 'saving';
    if (vals.includes('saved'))  return 'saved';
    return 'idle';
  }, [statuses]);

  const unanswered = cards.filter((c) => isResponseEmpty(responses[c.questionId] ?? null));

  async function doSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitAttemptAction(attemptId);
    if (result.ok) {
      router.push(`/attempts/${attemptId}/result` as Route);
    } else {
      setSubmitError(result.message ?? result.error);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl pb-24">
      <AttemptHeader
        title={title}
        attemptNo={attemptNo}
        maxAttempts={maxAttempts}
        overallStatus={overallStatus}
        lastSavedAt={lastSavedAt}
        onSubmit={() => setDialogOpen(true)}
        submitDisabled={overallStatus === 'saving' || submitting}
      />
      {submitError && (
        <div role="alert" className="mx-4 mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm">
          Submit failed: {submitError}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-4 px-4">
        {cards.map((c) => (
          <CardWithAutosave
            key={c.questionId}
            card={c}
            attemptId={attemptId}
            response={responses[c.questionId] ?? null}
            onChange={(r) => onChange(c.questionId, r)}
            onStatusChange={(s, when) => {
              setStatuses((p) => ({ ...p, [c.questionId]: s }));
              if (when) setLastSavedAt(when);
            }}
          />
        ))}
      </div>
      <div className="mx-4 mt-6 flex items-center justify-between text-sm text-muted-foreground">
        <span>{cards.length - unanswered.length} of {cards.length} answered</span>
        <a href="/" className="underline">Save and continue later</a>
      </div>
      <SubmitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        unansweredCount={unanswered.length}
        unansweredLabels={unanswered.map((c) => `Q${c.position + 1}`)}
        onConfirm={doSubmit}
        submitting={submitting}
      />
    </main>
  );
}

function CardWithAutosave({
  card, attemptId, response, onChange, onStatusChange,
}: {
  card: Card;
  attemptId: string;
  response: Response | null;
  onChange: (r: Response) => void;
  onStatusChange: (s: AutosaveStatus, when: Date | null) => void;
}) {
  const autosave = useAutosave({
    attemptId,
    questionId: card.questionId,
    response,
    onSave: saveAnswerAction,
  });
  // Propagate status to the parent.
  useStatusEffect(autosave.status, autosave.lastSavedAt, onStatusChange);
  return (
    <QuestionCard
      position={card.position}
      snapshot={card.snapshot}
      response={response}
      onChange={onChange}
      anchor={`q-${card.questionId}`}
    />
  );
}

import { useEffect } from 'react';
function useStatusEffect(
  status: AutosaveStatus,
  lastSavedAt: Date | null,
  cb: (s: AutosaveStatus, when: Date | null) => void
) {
  useEffect(() => { cb(status, lastSavedAt); }, [status, lastSavedAt, cb]);
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(student\)/attempts/\[aid\]/page.tsx app/\(student\)/attempts/\[aid\]/client.tsx
git commit -m "feat(student): add /attempts/[aid] page + client (single-page scroll attempt UI)"
```

---

### Task 18: Result page — CorrectAnswerReveal + shared ResultPage component

**Files:**

- Create: `components/result/CorrectAnswerReveal.tsx`
- Create: `components/result/ResultPage.tsx`

**Why:** The reveal block is type-dispatched. Shared `ResultPage` component is used by both student post-submit view and instructor drilldown, parameterized by `actor`.

- [ ] **Step 1: Write the reveal component**

Create `components/result/CorrectAnswerReveal.tsx`:

```tsx
'use client';

import type { AnswerSnapshot, Response } from '@/lib/grading';

export function CorrectAnswerReveal({
  snapshot, response,
}: { snapshot: AnswerSnapshot; response: Response | null }) {
  const target = snapshot.render.grading_target;
  switch (target.kind) {
    case 'mc': {
      const body = snapshot.render.rendered_body;
      const correctLabel = body.kind === 'mc'
        ? body.choices.find((c) => c.id === target.correct_id)?.label_substituted ?? target.correct_id
        : target.correct_id;
      return <p className="text-sm"><strong>Correct answer:</strong> {correctLabel}</p>;
    }
    case 'ma': {
      const body = snapshot.render.rendered_body;
      const labels = body.kind === 'ma'
        ? target.correct_ids.map((id) => body.choices.find((c) => c.id === id)?.label_substituted ?? id)
        : target.correct_ids;
      return <p className="text-sm"><strong>Correct answers:</strong> {labels.join(', ')}</p>;
    }
    case 'tf':
      return <p className="text-sm"><strong>Correct:</strong> {target.correct ? 'True' : 'False'}</p>;
    case 'numeric': {
      const out = `${target.value} ± ${target.tolerance}`;
      return <p className="text-sm"><strong>Expected:</strong> {out}{response?.type === 'numeric' && !Number.isFinite(Number(response.value)) ? ' — your answer was not a number' : ''}</p>;
    }
    case 'short_answer':
      return (
        <p className="text-sm">
          <strong>Pattern:</strong> <code>{target.pattern}</code>{' '}
          ({target.case_insensitive ? 'case-insensitive' : 'case-sensitive'})
        </p>
      );
    case 'fill_in':
      return (
        <ul className="text-sm">
          {target.targets.map((t) => {
            const yours = response?.type === 'fill_in' ? response.blanks[t.id] ?? '' : '';
            return (
              <li key={t.id}>
                <strong>Blank {t.id}:</strong> expected <code>{t.target}</code> — your answer: <code>{yours || '(blank)'}</code>
              </li>
            );
          })}
        </ul>
      );
  }
}
```

- [ ] **Step 2: Write the shared `ResultPage`**

Create `components/result/ResultPage.tsx`:

```tsx
'use client';

import { Markdown } from '@/lib/rendering';
import { AnswerSurface } from '@/components/preview/answer-surfaces';
import { CorrectAnswerReveal } from './CorrectAnswerReveal';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { AnswerSnapshot, Response, GradeResult } from '@/lib/grading';

export type ResultRow = {
  question_id: string;
  position: number;
  snapshot: AnswerSnapshot;
  response: Response | null;
  auto_score: number | null;
  score_method: string | null;
};

export type ResultPageProps = {
  actor: 'student' | 'instructor';
  title: string;
  attemptNo: number;
  maxAttempts: number;
  submittedAt: string | null;
  summary: { raw_score: number; max_score: number; percentage: number } | null;
  bestRaw: number | null;       // student's best raw across attempts
  rows: ResultRow[];
  /** Student-only: callback to start a new attempt. */
  onStartNew?: () => void;
  attemptsRemaining: number;
  /** Instructor-only: student email for the header. */
  studentEmail?: string;
};

function badge(auto: number | null, scoreMethod: string | null): { label: string; tone: 'ok' | 'warn' | 'err' } {
  if (auto == null) return { label: 'Not graded', tone: 'warn' };
  if (scoreMethod === 'auto_error') return { label: 'Could not auto-grade', tone: 'err' };
  if (auto === 1) return { label: `Correct (${auto.toFixed(2)}/1)`, tone: 'ok' };
  if (auto === 0) return { label: `Incorrect (0/1)`, tone: 'err' };
  return { label: `Partial credit (${auto.toFixed(2)}/1)`, tone: 'warn' };
}

export function ResultPage(p: ResultPageProps) {
  return (
    <main className="mx-auto max-w-3xl p-6 pb-24">
      <header className="mb-6">
        <p className="text-xs text-muted-foreground">
          <a href="/" className="underline">← Home</a>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{p.title}</h1>
        <p className="text-sm text-muted-foreground">
          {p.actor === 'instructor' && p.studentEmail
            ? `Attempt ${p.attemptNo} by ${p.studentEmail}`
            : `Attempt ${p.attemptNo} of ${p.maxAttempts}`}
          {p.submittedAt && ` · submitted ${new Date(p.submittedAt).toLocaleString()}`}
        </p>
      </header>

      {p.summary && (
        <section className="mb-6 rounded-lg border bg-card p-4">
          <p className="text-3xl font-bold">{p.summary.raw_score} / {p.summary.max_score}</p>
          <p className="text-sm text-muted-foreground">{p.summary.percentage.toFixed(2)}%</p>
          {p.bestRaw != null && p.summary.raw_score < p.bestRaw && (
            <p className="mt-2 text-xs text-muted-foreground">Highest score on this assessment: {p.bestRaw}</p>
          )}
          {p.actor === 'student' && p.attemptsRemaining > 0 && p.onStartNew && (
            <button
              onClick={p.onStartNew}
              className="mt-3 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Start new attempt ({p.attemptsRemaining} remaining)
            </button>
          )}
          {p.actor === 'student' && p.attemptsRemaining === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">No attempts remaining.</p>
          )}
        </section>
      )}

      <div className="flex flex-col gap-4">
        {p.rows.map((row) => {
          const b = badge(row.auto_score, row.score_method);
          return (
            <Card key={row.question_id} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-semibold">Q{row.position + 1}</h2>
                <Badge variant="secondary">{row.snapshot.question_type}</Badge>
                <Badge variant={b.tone === 'ok' ? 'default' : b.tone === 'err' ? 'destructive' : 'outline'}>
                  {b.label}
                </Badge>
              </div>
              <div className="prose mb-3 max-w-none">
                <Markdown source={row.snapshot.render.rendered_stem} />
              </div>
              <div className="mb-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Your response</p>
                <AnswerSurface
                  body={row.snapshot.render.rendered_body}
                  value={row.response}
                  onChange={() => {}}
                  disabled
                />
              </div>
              <div className="rounded bg-muted p-2">
                <CorrectAnswerReveal snapshot={row.snapshot} response={row.response} />
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/result/
git commit -m "feat(result): add CorrectAnswerReveal + shared ResultPage component"
```

---

### Task 19: Student result route (`/attempts/[aid]/result`)

**Files:**

- Create: `app/(student)/attempts/[aid]/result/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/(student)/attempts/[aid]/result/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStudent } from '@/lib/auth/require';
import { ResultPage, type ResultRow } from '@/components/result/ResultPage';
import { startAttemptAction } from '../../take/[id]/actions';
import type { AnswerSnapshot, Response } from '@/lib/grading';

type Props = { params: Promise<{ aid: string }> };

export default async function StudentResultPage({ params }: Props) {
  const { aid } = await params;
  const { user } = await requireStudent();
  const supabase = createServerSupabaseClient();

  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .select('id, status, attempt_no, summary, submitted_at, student_user_id, assessment_id, assessments(id, title, default_attempts)')
    .eq('id', aid)
    .maybeSingle();
  if (aErr || !attempt) notFound();
  if (attempt.student_user_id !== user.id) notFound();
  if (attempt.status === 'in_progress') redirect(`/attempts/${aid}` as Route);

  const assessment = attempt.assessments as unknown as { id: string; title: string; default_attempts: number };

  // Effective cap.
  const { data: override } = await supabase
    .from('assessment_overrides')
    .select('extra_attempts')
    .eq('assessment_id', attempt.assessment_id)
    .eq('student_user_id', user.id)
    .maybeSingle();
  const maxAttempts = (assessment.default_attempts ?? 1) + (override?.extra_attempts ?? 0);

  const { count: submittedCount } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('assessment_id', attempt.assessment_id)
    .eq('student_user_id', user.id)
    .eq('status', 'submitted');
  const attemptsRemaining = Math.max(0, maxAttempts - (submittedCount ?? 0));

  // Best raw across student's attempts on this assessment.
  const { data: bestRow } = await supabase
    .from('attempts')
    .select('summary')
    .eq('assessment_id', attempt.assessment_id)
    .eq('student_user_id', user.id)
    .eq('status', 'submitted');
  const bestRaw = (bestRow ?? []).reduce<number | null>((acc, r) => {
    const s = (r.summary as { raw_score?: number } | null)?.raw_score ?? null;
    if (s == null) return acc;
    return acc == null ? s : Math.max(acc, s);
  }, null);

  // Answer rows + positions.
  const { data: answers } = await supabase
    .from('answers')
    .select('question_id, rendered_question_snapshot, response, auto_score, score_method')
    .eq('attempt_id', aid);
  const { data: qPos } = await supabase
    .from('questions')
    .select('id, position')
    .eq('assessment_id', attempt.assessment_id);
  const posByQid = new Map((qPos ?? []).map((q) => [q.id, q.position]));

  const rows: ResultRow[] = (answers ?? []).map((row) => ({
    question_id: row.question_id,
    position: posByQid.get(row.question_id) ?? 0,
    snapshot: row.rendered_question_snapshot as unknown as AnswerSnapshot,
    response: (row.response ?? null) as Response | null,
    auto_score: (row.auto_score as number | null),
    score_method: (row.score_method as string | null),
  })).sort((a, b) => a.position - b.position);

  return (
    <form action={async () => { 'use server'; await startAttemptAction(attempt.assessment_id); }}>
      <ResultPage
        actor="student"
        title={assessment.title}
        attemptNo={attempt.attempt_no}
        maxAttempts={maxAttempts}
        submittedAt={attempt.submitted_at}
        summary={attempt.summary as { raw_score: number; max_score: number; percentage: number } | null}
        bestRaw={bestRaw}
        rows={rows}
        attemptsRemaining={attemptsRemaining}
      />
    </form>
  );
}
```

Note: the "Start new attempt" button is wired via the wrapping `<form action={server action}>`. ResultPage's `onStartNew` prop is the in-form submit handler — see the next step.

- [ ] **Step 2: Wire form-submit "Start new attempt"**

Update the inline `<form>` wrapper to a dedicated button server action. Replace the JSX in step 1's `return` with:

```tsx
async function startNewAction() {
  'use server';
  const r = await startAttemptAction(attempt.assessment_id);
  if (r.ok) {
    const { redirect } = await import('next/navigation');
    redirect(`/attempts/${r.attemptId}` as unknown as Route);
  }
}

return (
  <ResultPage
    actor="student"
    title={assessment.title}
    attemptNo={attempt.attempt_no}
    maxAttempts={maxAttempts}
    submittedAt={attempt.submitted_at}
    summary={attempt.summary as { raw_score: number; max_score: number; percentage: number } | null}
    bestRaw={bestRaw}
    rows={rows}
    attemptsRemaining={attemptsRemaining}
    onStartNew={attemptsRemaining > 0 ? startNewAction : undefined}
  />
);
```

(The `'use server'` directive promotes the inline function to a Server Action; React will wrap the button in a form automatically.)

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(student\)/attempts/\[aid\]/result/page.tsx
git commit -m "feat(student): add /attempts/[aid]/result post-submit page with reveal + retake"
```

---

### Task 20: Home page extension — student-visible assessments list

**Files:**

- Modify: `app/page.tsx`

- [ ] **Step 1: Read the current home page**

Read `app/page.tsx`. Note the existing instructor link block from Plan 2 Task 30.

- [ ] **Step 2: Add the student-visible assessments section**

Modify `app/page.tsx`. Inside the main element, AFTER the existing instructor link block (or BEFORE — same level), add the student section. Replace the entire file body with this layout (preserve existing sign-out + instructor-link logic exactly):

```tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Route } from 'next';
import { redirect } from 'next/navigation';

export default async function Home() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: me } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = me?.role ?? 'student';

  // Published assessments the user can see (RLS scopes the read).
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, title, status, opens_at, closes_at')
    .eq('status', 'published')
    .order('opens_at', { ascending: false, nullsFirst: false });

  // For each, compute the student's per-assessment status.
  type Row = { id: string; title: string; status: 'not_started' | 'in_progress' | 'best'; bestRaw?: number; bestMax?: number; attemptId?: string };
  const rows: Row[] = [];
  for (const a of assessments ?? []) {
    const { data: inProg } = await supabase
      .from('attempts').select('id')
      .eq('assessment_id', a.id).eq('student_user_id', user.id)
      .eq('status', 'in_progress').maybeSingle();
    if (inProg) { rows.push({ id: a.id, title: a.title, status: 'in_progress', attemptId: inProg.id }); continue; }

    const { data: subs } = await supabase
      .from('attempts').select('summary')
      .eq('assessment_id', a.id).eq('student_user_id', user.id)
      .eq('status', 'submitted');
    if (subs && subs.length > 0) {
      let bestRaw: number | null = null, bestMax: number | null = null;
      for (const s of subs) {
        const sum = s.summary as { raw_score?: number; max_score?: number } | null;
        if (sum?.raw_score != null && (bestRaw == null || sum.raw_score > bestRaw)) {
          bestRaw = sum.raw_score; bestMax = sum.max_score ?? null;
        }
      }
      rows.push({ id: a.id, title: a.title, status: 'best', bestRaw: bestRaw ?? 0, bestMax: bestMax ?? 0 });
    } else {
      rows.push({ id: a.id, title: a.title, status: 'not_started' });
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">BodhiLite</h1>
        <form action="/sign-out" method="post">
          <button type="submit" className="text-sm underline">Sign out</button>
        </form>
      </header>

      {role === 'instructor' && (
        <section className="mb-8 rounded border bg-card p-4">
          <h2 className="mb-2 text-lg font-semibold">Instructor</h2>
          <a href={'/assessments' as Route} className="text-sm underline">Manage assessments →</a>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Your assessments</h2>
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No assessments available right now.</p>
        )}
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded border p-3">
              <span className="font-medium">{r.title}</span>
              <span className="flex items-center gap-3 text-sm">
                {r.status === 'not_started' && <span className="text-muted-foreground">Not yet attempted</span>}
                {r.status === 'in_progress' && <span className="text-amber-700">In progress</span>}
                {r.status === 'best' && <span>Best: {r.bestRaw}/{r.bestMax}</span>}
                <a
                  href={`/take/${r.id}` as Route}
                  className="rounded bg-primary px-3 py-1 text-primary-foreground"
                >
                  {r.status === 'in_progress' ? 'Resume' : r.status === 'best' ? 'Retake' : 'Start'}
                </a>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): add student-visible assessments list with per-assessment status"
```

---

### Task 21: Instructor gradebook (`/assessments/[id]/attempts/page.tsx`)

**Files:**

- Create: `components/gradebook/GradebookTable.tsx`
- Create: `app/(instructor)/assessments/[id]/attempts/page.tsx`

- [ ] **Step 1: Write the table component**

Create `components/gradebook/GradebookTable.tsx`:

```tsx
import type { Route } from 'next';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export type GradebookRow = {
  assessment_id: string;
  student_user_id: string;
  student_email: string;
  attempts_used: number;
  best_raw: number | null;
  best_max: number | null;
  best_pct: number | null;
  last_submitted_at: string | null;
  best_attempt_id: string | null;
};

type SortDir = 'asc' | 'desc';
type SortKey = 'student_email' | 'attempts_used' | 'best_pct' | 'last_submitted_at';

export function GradebookTable({
  assessmentId, rows, maxAttempts, sort, dir,
}: {
  assessmentId: string;
  rows: GradebookRow[];
  maxAttempts: number;
  sort: SortKey;
  dir: SortDir;
}) {
  function headLink(k: SortKey, label: string) {
    const nextDir = sort === k && dir === 'desc' ? 'asc' : 'desc';
    return (
      <a href={`?sort=${k}&dir=${nextDir}` as Route} className="underline">
        {label} {sort === k ? (dir === 'desc' ? '↓' : '↑') : ''}
      </a>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{headLink('student_email', 'Student')}</TableHead>
          <TableHead>{headLink('attempts_used', 'Attempts')}</TableHead>
          <TableHead>Best score</TableHead>
          <TableHead>{headLink('best_pct', 'Best %')}</TableHead>
          <TableHead>{headLink('last_submitted_at', 'Last submitted')}</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No students have attempted this assessment yet.
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.student_user_id}>
            <TableCell>{r.student_email}</TableCell>
            <TableCell>{r.attempts_used} of {maxAttempts}</TableCell>
            <TableCell>{r.best_raw != null ? `${r.best_raw} / ${r.best_max}` : '—'}</TableCell>
            <TableCell>{r.best_pct != null ? `${r.best_pct.toFixed(2)}%` : '—'}</TableCell>
            <TableCell>{r.last_submitted_at ? new Date(r.last_submitted_at).toLocaleString() : '—'}</TableCell>
            <TableCell>
              {r.best_attempt_id ? (
                <a
                  href={`/assessments/${assessmentId}/attempts/${r.best_attempt_id}` as Route}
                  className="text-sm underline"
                >
                  View best
                </a>
              ) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Write the page**

Create `app/(instructor)/assessments/[id]/attempts/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireInstructor } from '@/lib/auth/require';
import { GradebookTable, type GradebookRow } from '@/components/gradebook/GradebookTable';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; dir?: string }>;
};

const SORT_KEYS = ['student_email', 'attempts_used', 'best_pct', 'last_submitted_at'] as const;
type SortKey = (typeof SORT_KEYS)[number];

export default async function GradebookPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  await requireInstructor();
  const supabase = createServerSupabaseClient();

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, title, default_attempts')
    .eq('id', id)
    .maybeSingle();
  if (!assessment) notFound();

  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sp.sort ?? '')
    ? (sp.sort as SortKey)
    : 'last_submitted_at';
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc';

  const { data: rows } = await supabase
    .from('gradebook_rows')
    .select('*')
    .eq('assessment_id', id)
    .order(sort, { ascending: dir === 'asc', nullsFirst: dir === 'asc' });

  // In-progress chip count.
  const { count: inProgress } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('assessment_id', id)
    .eq('status', 'in_progress');

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-4">
        <p className="text-xs text-muted-foreground">
          <a href={`/assessments/${id}`} className="underline">← {assessment.title}</a>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Attempts</h1>
        {(inProgress ?? 0) > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">{inProgress} in progress</p>
        )}
      </header>
      <GradebookTable
        assessmentId={id}
        rows={(rows ?? []) as GradebookRow[]}
        maxAttempts={assessment.default_attempts ?? 1}
        sort={sort}
        dir={dir}
      />
    </main>
  );
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/gradebook/ app/\(instructor\)/assessments/\[id\]/attempts/page.tsx
git commit -m "feat(gradebook): add instructor gradebook table + per-assessment page"
```

---

### Task 22: Instructor drilldown (`/assessments/[id]/attempts/[aid]/page.tsx`)

**Files:**

- Create: `app/(instructor)/assessments/[id]/attempts/[aid]/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/(instructor)/assessments/[id]/attempts/[aid]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireInstructor } from '@/lib/auth/require';
import { ResultPage, type ResultRow } from '@/components/result/ResultPage';
import type { AnswerSnapshot, Response } from '@/lib/grading';

type Props = { params: Promise<{ id: string; aid: string }> };

export default async function InstructorDrilldownPage({ params }: Props) {
  const { id, aid } = await params;
  await requireInstructor();
  const supabase = createServerSupabaseClient();

  // RLS scopes to instructor-owned assessments.
  const { data: attempt } = await supabase
    .from('attempts')
    .select('id, attempt_no, status, submitted_at, summary, student_user_id, assessment_id, assessments(id, title, default_attempts), users:student_user_id(email)')
    .eq('id', aid)
    .eq('assessment_id', id)
    .maybeSingle();
  if (!attempt) notFound();

  const assessment = attempt.assessments as unknown as { id: string; title: string; default_attempts: number };
  const studentEmail = (attempt.users as unknown as { email: string } | null)?.email ?? 'unknown';

  // Best raw across this student's attempts (for the badge).
  const { data: allAttempts } = await supabase
    .from('attempts')
    .select('summary')
    .eq('assessment_id', id)
    .eq('student_user_id', attempt.student_user_id)
    .eq('status', 'submitted');
  const bestRaw = (allAttempts ?? []).reduce<number | null>((acc, r) => {
    const s = (r.summary as { raw_score?: number } | null)?.raw_score ?? null;
    if (s == null) return acc;
    return acc == null ? s : Math.max(acc, s);
  }, null);

  const { data: answers } = await supabase
    .from('answers')
    .select('question_id, rendered_question_snapshot, response, auto_score, score_method')
    .eq('attempt_id', aid);
  const { data: qPos } = await supabase
    .from('questions')
    .select('id, position')
    .eq('assessment_id', id);
  const posByQid = new Map((qPos ?? []).map((q) => [q.id, q.position]));

  const rows: ResultRow[] = (answers ?? []).map((row) => ({
    question_id: row.question_id,
    position: posByQid.get(row.question_id) ?? 0,
    snapshot: row.rendered_question_snapshot as unknown as AnswerSnapshot,
    response: (row.response ?? null) as Response | null,
    auto_score: row.auto_score as number | null,
    score_method: row.score_method as string | null,
  })).sort((a, b) => a.position - b.position);

  return (
    <ResultPage
      actor="instructor"
      title={assessment.title}
      attemptNo={attempt.attempt_no}
      maxAttempts={assessment.default_attempts ?? 1}
      submittedAt={attempt.submitted_at}
      summary={attempt.summary as { raw_score: number; max_score: number; percentage: number } | null}
      bestRaw={bestRaw}
      rows={rows}
      attemptsRemaining={0}
      studentEmail={studentEmail}
    />
  );
}
```

- [ ] **Step 2: Add the "Attempts" link on the assessment overview page**

Read `app/(instructor)/assessments/[id]/page.tsx`. In the header strip section (after the title block), add a link:

```tsx
<a href={`/assessments/${id}/attempts` as Route} className="text-sm underline">
  View attempts →
</a>
```

(Import `Route` if not already imported.)

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(instructor\)/assessments/\[id\]/attempts/\[aid\]/page.tsx app/\(instructor\)/assessments/\[id\]/page.tsx
git commit -m "feat(gradebook): add instructor drilldown + attempts link from overview"
```

---

### Task 23: Plan 2 actions adopt requireInstructor

**Files:**

- Modify: `app/(instructor)/assessments/new/actions.ts`
- Modify: `app/(instructor)/assessments/[id]/edit-settings/actions.ts`
- Modify: `app/(instructor)/assessments/[id]/questions/new/actions.ts`
- Modify: `app/(instructor)/assessments/[id]/questions/[qid]/actions.ts`
- Modify: `app/(instructor)/assessments/[id]/questions/[qid]/actions-reorder.ts`
- Modify: `app/(instructor)/assessments/[id]/questions/[qid]/actions-delete.ts`

**Why:** Defense-in-depth (per spec §5.4). Each action currently relies on layout + RLS only.

- [ ] **Step 1: Apply the refactor to each file**

For EACH of the 6 actions files above:

1. At the top, add:
   ```ts
   import { requireInstructor } from '@/lib/auth/require';
   ```
2. Find the entry point (the exported `'use server'` function). Insert as the first line of the function body:
   ```ts
   await requireInstructor();
   ```
3. If the function previously called `createServerSupabaseClient()` + `auth.getUser()` to derive the user id, replace with:
   ```ts
   const { user } = await requireInstructor();
   // ...use user.id wherever auth.getUser() was used.
   ```

Do this in one commit; no behavior change beyond the gate.

- [ ] **Step 2: Run full vitest + typecheck**

Run: `npm test -- --run && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/\(instructor\)/
git commit -m "refactor(instructor-actions): gate all Plan 2 actions with requireInstructor"
```

---

### Task 24: RLS spec — attempts isolation

**Files:**

- Create: `tests/rls/attempts-isolation.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/rls/attempts-isolation.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('attempts RLS isolation', () => {
  const perTestUserIds: string[] = [];

  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  test('student A cannot SELECT student B attempts', async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const studentA = await createTestUserClient('student', perTestUserIds);
    const studentB = await createTestUserClient('student', perTestUserIds);

    // Seed assessment + a student-B attempt as admin.
    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'A', slug: `a-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');

    const { data: at } = await admin.from('attempts').insert({
      assessment_id: a.id, student_user_id: studentB.id, attempt_no: 1, seed: 1, status: 'in_progress',
    }).select('id').single();
    if (!at) throw new Error('seed attempts failed');

    // A reads → 0 rows.
    const { data: visible } = await studentA.client
      .from('attempts').select('id').eq('id', at.id);
    expect(visible).toEqual([]);
  });

  test('student A cannot INSERT with student_user_id = B', async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const studentA = await createTestUserClient('student', perTestUserIds);
    const studentB = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'A', slug: `a-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');

    const { error } = await studentA.client.from('attempts').insert({
      assessment_id: a.id, student_user_id: studentB.id, attempt_no: 1, seed: 1, status: 'in_progress',
    });
    expect(error).not.toBeNull();   // RLS rejects
  });

  test('instructor cannot read attempts on non-owned assessment', async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst1 = await createTestUserClient('instructor', perTestUserIds);
    const inst2 = await createTestUserClient('instructor', perTestUserIds);
    const student = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst1.id, title: 'A', slug: `a-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');

    const { data: at } = await admin.from('attempts').insert({
      assessment_id: a.id, student_user_id: student.id, attempt_no: 1, seed: 1, status: 'in_progress',
    }).select('id').single();
    if (!at) throw new Error('seed attempt failed');

    const { data } = await inst2.client.from('attempts').select('id').eq('id', at.id);
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/rls/attempts-isolation.spec.ts
git commit -m "test(rls): attempts cross-student + cross-instructor isolation"
```

---

### Task 25: RLS spec — answers isolation + snapshot immutability + submit-after-submit

**Files:**

- Create: `tests/rls/answers-isolation.spec.ts`
- Create: `tests/rls/snapshot-immutability-plan3.spec.ts`
- Create: `tests/rls/submit-after-submit.spec.ts`

**Why:** Bundle the three smaller RLS proofs into one task. Each spec ≤ 60 lines.

- [ ] **Step 1: Write `answers-isolation.spec.ts`**

Create `tests/rls/answers-isolation.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('answers RLS isolation', () => {
  const perTestUserIds: string[] = [];

  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('student A cannot SELECT student B answers', async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const sA = await createTestUserClient('student', perTestUserIds);
    const sB = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'A', slug: `a-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('assess seed failed');
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'tf',
      body: { stem: 'T' }, scoring: { correct: true },
    }).select('id').single();
    if (!q) throw new Error('question seed failed');
    const { data: at } = await admin.from('attempts').insert({
      assessment_id: a.id, student_user_id: sB.id, attempt_no: 1, seed: 1, status: 'in_progress',
    }).select('id').single();
    if (!at) throw new Error('attempt seed failed');
    const { data: ans } = await admin.from('answers').insert({
      attempt_id: at.id, question_id: q.id,
      rendered_question_snapshot: { question_id: q.id, question_type: 'tf', seed: 1, rendered_at: 'x', render: {} },
    }).select('id').single();
    if (!ans) throw new Error('answer seed failed');

    const { data } = await sA.client.from('answers').select('id').eq('id', ans.id);
    expect(data).toEqual([]);
  });

  test('student A cannot UPDATE student B answers', async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const sA = await createTestUserClient('student', perTestUserIds);
    const sB = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'A', slug: `a-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'tf', body: { stem: 'T' }, scoring: { correct: true },
    }).select('id').single();
    if (!q) throw new Error('seed q failed');
    const { data: at } = await admin.from('attempts').insert({
      assessment_id: a.id, student_user_id: sB.id, attempt_no: 1, seed: 1, status: 'in_progress',
    }).select('id').single();
    if (!at) throw new Error('seed at failed');
    const { data: ans } = await admin.from('answers').insert({
      attempt_id: at.id, question_id: q.id,
      rendered_question_snapshot: { question_id: q.id, question_type: 'tf', seed: 1, rendered_at: 'x', render: {} },
    }).select('id').single();
    if (!ans) throw new Error('seed ans failed');

    const { data, error } = await sA.client.from('answers')
      .update({ response: { type: 'tf', value: true } })
      .eq('id', ans.id)
      .select('id');
    // RLS scopes the UPDATE: either error null + empty data, or explicit error.
    if (!error) expect(data ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Write `snapshot-immutability-plan3.spec.ts`**

Create `tests/rls/snapshot-immutability-plan3.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('answers.rendered_question_snapshot is immutable (Plan 3 regression)', () => {
  const perTestUserIds: string[] = [];
  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('service-role UPDATE that changes snapshot raises', async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const student = await createTestUserClient('student', perTestUserIds);
    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'A', slug: `a-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'tf', body: { stem: 'T' }, scoring: { correct: true },
    }).select('id').single();
    if (!q) throw new Error('seed q failed');
    const { data: at } = await admin.from('attempts').insert({
      assessment_id: a.id, student_user_id: student.id, attempt_no: 1, seed: 1, status: 'in_progress',
    }).select('id').single();
    if (!at) throw new Error('seed at failed');
    const original = { question_id: q.id, question_type: 'tf', seed: 1, rendered_at: 'x', render: { v: 1 } };
    const { data: ans } = await admin.from('answers').insert({
      attempt_id: at.id, question_id: q.id, rendered_question_snapshot: original,
    }).select('id').single();
    if (!ans) throw new Error('seed ans failed');

    const mutated = { ...original, render: { v: 999 } };
    const { error } = await admin.from('answers')
      .update({ rendered_question_snapshot: mutated })
      .eq('id', ans.id);
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/immutable/i);
  });
});
```

- [ ] **Step 3: Write `submit-after-submit.spec.ts`**

Create `tests/rls/submit-after-submit.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('submit_attempt is idempotent (cannot submit twice)', () => {
  const perTestUserIds: string[] = [];
  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('second submit_attempt call raises', async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const student = await createTestUserClient('student', perTestUserIds);
    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'A', slug: `a-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'tf', body: { stem: 'T' }, scoring: { correct: true },
    }).select('id').single();
    if (!q) throw new Error('seed q failed');

    // Start as student via RPC.
    const snapshots = [{ question_id: q.id, snapshot: { question_id: q.id, question_type: 'tf', seed: 1, rendered_at: 'x', render: { grading_target: { kind: 'tf', correct: true } } } }];
    const { data: aid } = await student.client.rpc('start_attempt', {
      p_assessment_id: a.id, p_student_user_id: student.id, p_attempt_no: 1, p_seed: 1, p_snapshots: snapshots,
    });
    if (!aid) throw new Error('start_attempt failed');

    // First submit OK.
    const { error: e1 } = await student.client.rpc('submit_attempt', {
      p_attempt_id: aid, p_grades: [{ question_id: q.id, auto_score: 1, score_method: 'auto' }],
      p_summary: { raw_score: 1, max_score: 1, percentage: 100 },
    });
    expect(e1).toBeNull();

    // Second submit must error.
    const { error: e2 } = await student.client.rpc('submit_attempt', {
      p_attempt_id: aid, p_grades: [{ question_id: q.id, auto_score: 0, score_method: 'auto' }],
      p_summary: { raw_score: 0, max_score: 1, percentage: 0 },
    });
    expect(e2).not.toBeNull();
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add tests/rls/answers-isolation.spec.ts tests/rls/snapshot-immutability-plan3.spec.ts tests/rls/submit-after-submit.spec.ts
git commit -m "test(rls): answers isolation + snapshot immutability + idempotent submit"
```

---

### Task 26: a11y specs — take page, result page, gradebook

**Files:**

- Create: `tests/a11y/take-page.spec.ts`
- Create: `tests/a11y/result-page.spec.ts`
- Create: `tests/a11y/gradebook.spec.ts`

- [ ] **Step 1: Write `take-page.spec.ts`**

Create `tests/a11y/take-page.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';
import { signInBrowser } from '../helpers/browser-session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('take page (in-progress attempt) a11y', () => {
  const perTestUserIds: string[] = [];
  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('no critical axe violations', async ({ page, context }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const student = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'a11y take', slug: `at-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 1,
    }).select('id').single();
    if (!a) throw new Error('seed failed');
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'mc',
      body: { stem: 'Pick A', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
      scoring: { correct_id: 'a' },
    }).select('id').single();
    if (!q) throw new Error('seed q failed');

    await signInBrowser(context, student);
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
```

- [ ] **Step 2: Write `result-page.spec.ts`**

Create `tests/a11y/result-page.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';
import { signInBrowser } from '../helpers/browser-session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('result page a11y', () => {
  const perTestUserIds: string[] = [];
  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('no critical violations on a seeded submitted attempt', async ({ page, context }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const student = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'a11y result', slug: `ar-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 1,
    }).select('id').single();
    if (!a) throw new Error('seed failed');
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'tf', body: { stem: 'T?' }, scoring: { correct: true },
    }).select('id').single();
    if (!q) throw new Error('seed q failed');

    const snap = { question_id: q.id, question_type: 'tf', seed: 1, rendered_at: 'x', render: {
      materialized_values: {}, rendered_stem: 'T?', rendered_body: { kind: 'tf' },
      grading_target: { kind: 'tf', correct: true }, validation_errors: [],
    }};
    const { data: at } = await admin.from('attempts').insert({
      assessment_id: a.id, student_user_id: student.id, attempt_no: 1, seed: 1,
      status: 'submitted', submitted_at: new Date().toISOString(),
      summary: { raw_score: 1, max_score: 1, percentage: 100 },
    }).select('id').single();
    if (!at) throw new Error('seed at failed');
    await admin.from('answers').insert({
      attempt_id: at.id, question_id: q.id,
      rendered_question_snapshot: snap,
      response: { type: 'tf', value: true },
      auto_score: 1, score_method: 'auto', graded_at: new Date().toISOString(),
    });

    await signInBrowser(context, student);
    await page.goto(`/attempts/${at.id}/result`);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
```

- [ ] **Step 3: Write `gradebook.spec.ts`**

Create `tests/a11y/gradebook.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';
import { signInBrowser } from '../helpers/browser-session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('gradebook page a11y', () => {
  const perTestUserIds: string[] = [];
  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('no critical violations', async ({ page, context }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'a11y gb', slug: `gb-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');

    await signInBrowser(context, inst);
    await page.goto(`/assessments/${a.id}/attempts`);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add tests/a11y/take-page.spec.ts tests/a11y/result-page.spec.ts tests/a11y/gradebook.spec.ts
git commit -m "test(a11y): add take + result + gradebook axe specs"
```

---

### Task 27: E2E spec — take and submit happy path

**Files:**

- Create: `tests/student/take-and-submit.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/student/take-and-submit.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';
import { signInBrowser } from '../helpers/browser-session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('student take + submit happy path', () => {
  const perTestUserIds: string[] = [];
  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('answer one mc question, submit, see score and reveal', async ({ page, context }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const student = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'E2E take', slug: `tas-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');
    await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'mc',
      body: { stem: 'What is 2+2?', choices: [
        { id: 'a', label: '3' }, { id: 'b', label: '4' }, { id: 'c', label: '5' }
      ]},
      scoring: { correct_id: 'b' },
    });

    await signInBrowser(context, student);
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);

    // Pick the right choice.
    await page.getByLabel('4').click();

    // Submit.
    await page.getByRole('button', { name: /submit attempt/i }).click();
    await page.getByRole('button', { name: /^submit$/i }).click();

    await page.waitForURL(/\/result$/);
    await expect(page.getByText('1 / 1')).toBeVisible();
    await expect(page.getByText(/correct answer/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/student/take-and-submit.spec.ts
git commit -m "test(e2e): student take + submit + reveal happy path"
```

---

### Task 28: E2E spec — resume in-progress attempt

**Files:**

- Create: `tests/student/resume-attempt.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/student/resume-attempt.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';
import { signInBrowser } from '../helpers/browser-session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('student resume in-progress attempt', () => {
  const perTestUserIds: string[] = [];
  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('navigates back to same /attempts/[aid] and restores response', async ({ page, context }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const student = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'Resume', slug: `r-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');
    await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'mc',
      body: { stem: 'pick', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
      scoring: { correct_id: 'a' },
    });

    await signInBrowser(context, student);
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    const url1 = page.url();
    await page.getByLabel('A').click();

    // Wait for autosave (debounce 500ms).
    await page.waitForTimeout(1200);

    // Navigate away then back.
    await page.goto('/');
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    expect(page.url()).toBe(url1);   // same attempt id, not a new one
    await expect(page.getByLabel('A')).toBeChecked();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/student/resume-attempt.spec.ts
git commit -m "test(e2e): resume in-progress attempt restores prior response"
```

---

### Task 29: E2E spec — retake produces different seed

**Files:**

- Create: `tests/student/retake-different-seed.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/student/retake-different-seed.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';
import { signInBrowser } from '../helpers/browser-session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('retake uses a different seed → different materialized values', () => {
  const perTestUserIds: string[] = [];
  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('attempt 2 materializes differently from attempt 1', async ({ page, context }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const student = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'Retake', slug: `rt-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'numeric',
      body: { stem: 'mass = {{m}}; answer m+1' }, scoring: { formula: 'm + 1', tolerance: 0.01 },
    }).select('id').single();
    if (!q) throw new Error('seed q failed');
    await admin.from('question_variables').insert({
      question_id: q.id, name: 'm', type: 'randint', spec: { type: 'randint', min: 10, max: 999 },
    });

    await signInBrowser(context, student);

    // Attempt 1
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    const stem1 = await page.locator('h2:has-text("Q1")').locator('xpath=following-sibling::div[1]').first().textContent();

    // Submit attempt 1 (any value)
    await page.getByLabel('Numeric answer').fill('0');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /submit attempt/i }).click();
    await page.getByRole('button', { name: /submit anyway/i }).click();
    await page.waitForURL(/\/result$/);

    // Start attempt 2
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    const stem2 = await page.locator('h2:has-text("Q1")').locator('xpath=following-sibling::div[1]').first().textContent();

    expect(stem2).not.toBe(stem1);   // materialized {{m}} differs
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/student/retake-different-seed.spec.ts
git commit -m "test(e2e): retake produces a different seed (different materialized values)"
```

---

### Task 30: E2E spec — instructor gradebook shows attempts

**Files:**

- Create: `tests/instructor/gradebook-shows-attempts.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/instructor/gradebook-shows-attempts.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUserClient } from '../helpers/instructor';
import { signInBrowser } from '../helpers/browser-session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('instructor gradebook shows submitted attempts', () => {
  const perTestUserIds: string[] = [];
  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    for (const id of perTestUserIds) await admin.auth.admin.deleteUser(id);
  });

  test('two students with attempts both appear with best scores', async ({ page, context }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const inst = await createTestUserClient('instructor', perTestUserIds);
    const s1 = await createTestUserClient('student', perTestUserIds);
    const s2 = await createTestUserClient('student', perTestUserIds);

    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: inst.id, title: 'GB E2E', slug: `gbe-${Date.now()}`,
      status: 'published', assessment_type: 'quiz', default_attempts: 3,
    }).select('id').single();
    if (!a) throw new Error('seed failed');
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a.id, position: 0, type: 'tf', body: { stem: 'T?' }, scoring: { correct: true },
    }).select('id').single();
    if (!q) throw new Error('seed q failed');

    const snap = (correct: boolean) => ({
      question_id: q.id, question_type: 'tf', seed: 1, rendered_at: 'x',
      render: {
        materialized_values: {}, rendered_stem: 'T?',
        rendered_body: { kind: 'tf' },
        grading_target: { kind: 'tf', correct },
        validation_errors: [],
      }
    });

    for (const { sid, score, raw } of [
      { sid: s1.id, score: 1, raw: snap(true) },
      { sid: s2.id, score: 0, raw: snap(true) },
    ]) {
      const { data: at } = await admin.from('attempts').insert({
        assessment_id: a.id, student_user_id: sid, attempt_no: 1, seed: 1,
        status: 'submitted', submitted_at: new Date().toISOString(),
        summary: { raw_score: score, max_score: 1, percentage: score * 100 },
      }).select('id').single();
      if (!at) throw new Error('seed at failed');
      await admin.from('answers').insert({
        attempt_id: at.id, question_id: q.id,
        rendered_question_snapshot: raw,
        response: { type: 'tf', value: score === 1 },
        auto_score: score, score_method: 'auto',
        graded_at: new Date().toISOString(),
      });
    }

    await signInBrowser(context, inst);
    await page.goto(`/assessments/${a.id}/attempts`);

    await expect(page.getByText(s1.email)).toBeVisible();
    await expect(page.getByText(s2.email)).toBeVisible();
    // 100% and 0% best
    await expect(page.getByText('100.00%')).toBeVisible();
    await expect(page.getByText('0.00%')).toBeVisible();

    // Click "View best" on the first row → drilldown loads.
    await page.getByRole('link', { name: 'View best' }).first().click();
    await page.waitForURL(/\/assessments\/.+\/attempts\/.+/);
    await expect(page.getByText(/attempt 1 by/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/instructor/gradebook-shows-attempts.spec.ts
git commit -m "test(e2e): instructor gradebook lists attempts + drilldown loads"
```

---

### Task 31: Append Plan 3 critical path to NVDA runbook

**Files:**

- Modify: `docs/runbooks/nvda-test-script.md`

- [ ] **Step 1: Read the current runbook**

Open `docs/runbooks/nvda-test-script.md` and locate the end of the Plan 2 section. Append the new section.

- [ ] **Step 2: Append the Plan 3 section**

Append to `docs/runbooks/nvda-test-script.md`:

```markdown

## Plan 3 — Student attempt + result + gradebook critical path (added 2026-05-26)

**Setup:** local Supabase up; seed one published assessment with 3 questions (one mc, one numeric, one tf). Seed a student account.

**Steps (with NVDA running, Firefox or Chrome):**

1. Navigate to `/sign-in`. Tab into the email field — NVDA reads "Email, edit text". Enter the student email; submit. Navigate to the magic-link in the mock inbox; land on `/`.
2. On `/`: tab to "Your assessments" list. Read the row → "Not yet attempted, Start link". Activate "Start" with Enter.
3. Landing on `/attempts/[aid]`: NVDA reads "Attempt 1 of 3, Saved" (the header). Heading-jump (H) skims Q1, Q2, Q3.
4. Q1 (mc): tab to radios; Up/Down arrows move between choices and read labels. Pick the correct choice.
5. Q2 (numeric): tab to the input; NVDA reads "Numeric answer, edit text". Type the right value.
6. Q3 (tf): radios; pick True or False as appropriate.
7. After each input change, the header should announce "Saving…" then "Saved 0s ago" within ~1 second. Confirm with NVDA's read-current-line (Insert+Up).
8. Activate "Submit attempt" via Tab + Enter. Dialog opens — NVDA reads "Submit attempt? This will end your attempt…". Activate "Submit".
9. Land on `/attempts/[aid]/result`. NVDA reads the score banner. Heading-jump confirms each question card has H2 "Q1", "Q2", "Q3". The "Correct answer" reveal block is read via Tab into the card region.
10. Navigate back to `/`. NVDA reads "Your assessments" with "Best: N/M" status. Activate "Retake" → starts a fresh attempt with new materialization.

**Pass criteria:**

- All form controls have non-default accessible names.
- The autosave indicator change is read by NVDA on each save.
- The submit dialog announces unanswered counts when applicable.
- Per-question correctness badges (Correct / Incorrect / Partial) are read inline with the heading.

**Run before merging Plan 3.**
```

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/nvda-test-script.md
git commit -m "docs(nvda): add Plan 3 critical path runbook section"
```

---

### Task 32: Push branch + open draft PR

**Files:**

- (No file changes — PR open is a meta-task)

- [ ] **Step 1: Push the branch**

Run:

```bash
git push -u origin wave-1-plan3-attempt-grading
```

Expected: branch pushed; CI starts on the upcoming PR.

- [ ] **Step 2: Open the draft PR**

Run:

```bash
gh pr create --draft --title "Wave 1 Plan 3: Student Attempt + Grading" --body "$(cat <<'EOF'
## Summary

Plan 3 ships the student-facing surface for Wave 1: take an assessment, autosave per-question, submit and see auto-graded results + reveal, with multi-attempt + auto-resume. Also ships the instructor gradebook (per-assessment table + drill-down). All grading reads from a self-contained snapshot captured at attempt start.

**Migrations:**
- `0014_attempt_summary.sql` — `attempts.summary` JSONB column + composite index
- `0015_grading_helpers.sql` — `student_owns_in_progress_attempt` + `start_attempt` + `submit_attempt` (SECURITY DEFINER)
- `0016_gradebook_view.sql` — `gradebook_rows` view

**Plan:** `docs/superpowers/plans/2026-05-26-bodhilite-wave1-plan3-attempt-grading.md`
**Spec:** `docs/superpowers/specs/2026-05-26-bodhilite-wave1-plan3-attempt-grading-design.md`

## Test plan

- [ ] CI green (vitest + lint + typecheck + format)
- [ ] E2E green (Playwright — auth + RLS + a11y + student + instructor)
- [ ] Manual NVDA pass per `docs/runbooks/nvda-test-script.md` (Plan 3 critical path)
- [ ] Success-criteria walkthrough: take a parameterized quiz as student, see graded results, retake produces different seed, instructor gradebook shows attempts with drilldown
- [ ] No regressions in Plan 2 authoring (`/assessments/*` routes still work; preview still interactive)
EOF
)"
```

Expected: draft PR opened. URL printed. CI begins.

- [ ] **Step 3: Run local pre-flight checks (mirror CI)**

Run:

```bash
npm run lint && npm run typecheck && npm run format:check && npm test -- --run
```

Expected: PASS across the board. If `format:check` reports issues, run `npm run format` on the specific files reported by CI (see Plan 2 tech-gotchas about Windows-CRLF vs Linux-Prettier).

- [ ] **Step 4: Note PR URL for the project-state memory**

Capture the PR URL in the session log. Wait for CI before marking ready.

---

### Task 33: Plan 3 success-criteria walkthrough + ready-for-review

**Files:**

- (No file changes)

**Why:** Plan 2's pattern — keep PR draft until success-criteria walkthrough passes manually.

- [ ] **Step 1: Wait for CI green**

Watch the PR's checks. Apply any CI-fix commits the same way Plan 2 did:

- Format failures → pull the exact failing list from `gh run view --log-failed`, run `prettier --write` on those files only, commit as `style(prettier): reformat N files for CI`.
- E2E failures → download the HTML report artifact via `gh run download` to debug.

- [ ] **Step 2: Run the NVDA runbook section "Plan 3 — Student attempt + result + gradebook critical path"**

Per `docs/runbooks/nvda-test-script.md`. Document any blocker; fix or file as follow-up.

- [ ] **Step 3: Success-criteria walkthrough**

In a clean session (or directly), exercise:

1. Start an attempt → answer all 6 question types → submit → see reveal.
2. Retake → confirm materialized values changed.
3. As instructor, open gradebook → see two seeded students → drill into best attempt → confirm same view as student result page.
4. Verify per-question autosave indicator behavior.
5. Verify `submit` blocks while saves are in flight.

- [ ] **Step 4: Mark PR ready**

When all of the above pass:

```bash
gh pr ready
```

Stop. The merge decision is the user's, not the implementer's.

---

## Summary

This plan ships Plan 3 in 33 atomic commits across:

- **3 migrations** (`0014` summary column + index, `0015` grading helpers + tightened answers UPDATE policy, `0016` gradebook view)
- **5 pure-TS keystone modules** (snapshot, response, grade, summary, plus a renderer extension for `ma.partial_credit`)
- **2 auth helpers** (`requireStudent`, `requireInstructor`)
- **1 AnswerSurface refactor** (controlled mode + disabled — backwards compatible)
- **3 Server Actions** (`startAttemptAction`, `saveAnswerAction`, `submitAttemptAction`)
- **5 student routes / components** (`/take/[id]`, `/attempts/[aid]` server + client + 3 attempt components, `useAutosave`, `/attempts/[aid]/result`)
- **Result page + reveal** (shared component used by student post-submit + instructor drilldown)
- **Home page extension** (student-visible assessments list)
- **2 instructor pages + 1 component** (gradebook table + per-assessment + drilldown)
- **1 Plan-2-actions refactor** (adopt `requireInstructor`)
- **4 RLS specs** (attempts isolation, answers isolation, snapshot immutability regression, submit idempotency)
- **3 a11y specs** (take, result, gradebook)
- **4 E2E specs** (take-and-submit, resume, retake-different-seed, gradebook-shows-attempts)
- **1 NVDA runbook append**
- **1 PR open + 1 ready-for-review wrap**

Reuses from Plan 2 with zero modification: `lib/rendering/`, `lib/materializer/`, `lib/grading/formula.ts`, `lib/grading/chem-data/`, `lib/schemas/`, `lib/supabase/` clients.

## Test plan

After every task, the implementer runs the task's local test step. After each batch, the dispatcher runs:

```bash
npm run lint && npm run typecheck && npm test -- --run
```

Once routes exist (Task 17 onward), additionally run Playwright suites locally before pushing:

```bash
npx playwright test
```

CI runs the full suite on every push to the PR branch.

## Self-review

Spec-coverage scan (each spec section → task that implements it):

- §1 D1 (gradebook in Plan 3) → Tasks 21, 22.
- §1 D2 (single-page-scroll) → Tasks 16, 17.
- §1 D3 (highest-counts + auto-resume) → Task 12 (action), Tasks 19+20 (UX).
- §1 D4 / D9 (reveal on result) → Tasks 18, 19.
- §1 D5 (precomputed grading targets in snapshot) → Tasks 5, 7 (already in renderer post-Task 4).
- §1 D6 (Shape A — Server Actions) → Tasks 12, 13, 14.
- §1 D7 (sync auto-grade) → Task 14.
- §1 D8 (quiz-only) → covered implicitly; no timer code anywhere.
- §1 D10 (PL/pgSQL submit_attempt) → Task 2.
- §1 D11 (controlled AnswerSurface) → Task 11.
- §1 D12 (requireStudent/Instructor) → Task 9, Task 23.
- §2 routes (entry, attempt, result, gradebook, drilldown) → Tasks 12, 17, 19, 21, 22.
- §2.2 access control matrix → enforced inside each page via `requireStudent`/`requireInstructor` + ownership checks (Tasks 12, 17, 19, 21, 22). Student/instructor 404 paths covered by the `notFound()` calls in Tasks 17, 19, 22.
- §2.3 home page extension → Task 20.
- §3.1–3.4 attempt layout, controlled refactor, autosave, submit flow → Tasks 11, 15, 16, 17.
- §4.1–4.4 snapshot + grade + summary → Tasks 4, 5, 6, 7, 8.
- §5.1–5.4 Server Actions + auth helpers → Tasks 9, 12, 13, 14.
- §6.1–6.4 result page + multi-attempt + resume → Tasks 18, 19, 20 (resume covered by `startAttemptAction` idempotency, exercised in E2E Task 28).
- §7.1–7.3 gradebook + drilldown + overview link → Tasks 21, 22.
- §8.1–8.4 migrations + RLS audit → Tasks 1, 2, 3 + Task 25 (RLS regression coverage).
- §9 testing strategy → Tasks 24, 25, 26, 27, 28, 29, 30, 31.

Placeholder scan — no "TBD", "TODO", or "see spec §X" placeholders in the plan. Every step shows the actual code.

Type-consistency scan:
- `AnswerSnapshot`, `Response`, `GradeResult`, `AttemptSummary` defined in lib/grading; consumed identically in Tasks 12, 14, 17, 18, 19, 22. ✓
- `SaveResult`, `SubmitResult`, `StartResult` defined in actions; consumed in client.tsx (Task 17) and the result page form action (Task 19). ✓
- `requireStudent` returns `{user, role}`; `requireInstructor` returns `{user}`. Used consistently in Tasks 12, 13, 14, 17, 19, 21, 22. ✓
- `GradebookRow` shape matches the view in migration `0016` 1:1. ✓

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-bodhilite-wave1-plan3-attempt-grading.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Per Plan 2's proven rhythm: fresh implementer subagent per task (Haiku for mechanical tasks, Sonnet for moderate integration), spec compliance review (Haiku), code quality review (Haiku or Sonnet). Continuous execution across tasks; pause only on real ambiguity / blockers.
2. **Inline Execution** — REQUIRED SUB-SKILL: `superpowers:executing-plans`. Single context, batched execution with checkpoints.

Which approach?
