# BodhiLite — Wave 1 Plan 2 (Authoring) Design

**Date:** 2026-05-18
**Author:** A. Elangovan + Claude (brainstorming session)
**Status:** Draft — awaiting user sign-off before plan-writing
**Parent spec:** [`2026-05-16-bodhilite-phase1-design.md`](2026-05-16-bodhilite-phase1-design.md) (locked)
**Predecessor plan:** [`2026-05-16-bodhilite-wave1-foundation.md`](../plans/2026-05-16-bodhilite-wave1-foundation.md) (Plan 1 — merged in `eb9e319`)

---

## 0. Scope of this document

Plan 2 is the **Authoring** slice of Wave 1. It builds the instructor-facing surface for creating quizzes, authoring the six standard objective question types, parameterizing them with materialized variables, and previewing them interactively as a student would see them. It does **not** include persistence of student attempts, auto-grading, or the student-facing routes — those belong to Plan 3.

This document describes WHAT Plan 2 delivers and HOW the modules fit together. The implementation plan (task breakdown, ordering, atomic-commit boundaries) is generated separately by the writing-plans skill from this spec.

### Plan boundary (decided during brainstorming)

- **Plan 2 builds:** instructor route tree, assessment CRUD, six question editors, variable spec UI, formula evaluator, materializer, single rendering pipeline, interactive split-pane preview.
- **Plan 2 does NOT build:** student route tree, `answers.rendered_question_snapshot` persistence, auto-grading, gradebook, CSV export, image upload, Ketcher / RDKit integration, the Python service.
- **Plan 3 will reuse from Plan 2:** the renderer module, the materializer, the seed function, the formula evaluator, the per-type body/scoring zod schemas, and most of the answer-input UI components.

---

## 1. Decisions locked during brainstorming

These are the design-shaping decisions made before plan-writing. Each is recorded here so the implementation plan can flow from them without re-litigation.

| # | Decision | Why |
|---|---|---|
| D1 | **Plan 2 ends at interactive preview.** Instructor can type answers into the preview surface; no persistence, no grading hint. | Answer-form components are the heaviest UI work; building them interactively now and reusing in Plan 3 is roughly the same effort as building read-only and rewriting. Dogfoodable while Plan 3 is in flight. |
| D2 | **Formula evaluator in TypeScript, not Python (yet).** | Wave 1 has no Python infra; standing it up just to evaluate `a + b * sqrt(c)` is overkill. Wave 2 will add the Python service for chem grading; if the formula surface needs to share code then, fixtures port across runtimes. |
| D3 | **Defer image upload to Plan 4.** | Most Wave 1 quizzes are math/numeric; chem structures arrive via Ketcher in Wave 2 (separate channel). Image-upload infrastructure pairs naturally with backups/Storage ops in Plan 4. |
| D4 | **Instructor role bootstrap via manual SQL bump.** | Phase 1 has one instructor (the user). One-line `UPDATE public.users SET role='instructor' WHERE email = ?` documented in the deploy runbook is honest for the cohort size. |
| D5 | **Explicit Save buttons; no autosave in the editor.** | Authoring is not the same workflow as student attempts (which do auto-save per spec §8.6). Predictable form semantics, lowest risk of partial writes, browser `beforeunload` warning on unsaved changes. |
| D6 | **Split-pane editor layout (editor left, live preview right).** | Best feedback loop for parameterized chem/math — instructor sees variables resolve and grading targets update as they type. Narrow-screen fallback collapses to tabs (≤1024 px). |
| D7 | **Question type is locked after creation.** | Changing type would require migrating between discriminated `body`/`scoring` schemas. Plan 2 ships delete + create as the workaround; an in-place type-change UX is deferred to a polish phase if/when the workflow proves painful. |
| D8 | **Up/down arrow buttons for question reorder; no drag-and-drop.** | Keyboard-accessible by default, no DnD a11y burden. DnD is a polish-tier improvement for a future plan. |
| D9 | **Structured `RenderOutput` instead of HTML strings.** | The parent spec's "rendered_html" phrasing meant deterministic equivalence, not literal HTML serialization. Structured output lets React reconcile, lets a11y attributes apply at component-render time, and gives Plan 3 a queryable / diff-able JSONB snapshot instead of an opaque blob. |

---

## 2. Routes and navigation

### 2.1 New route group

```
app/
  (instructor)/
    assessments/
      page.tsx                        list of assessments owned by current user
      new/
        page.tsx                      create form (title, slug, type, timing, attempts)
        actions.ts                    Server Action: insert + redirect
      [id]/
        page.tsx                      assessment overview: settings + question list (combined)
        edit-settings/
          actions.ts                  Server Action: update settings
        questions/
          new/
            page.tsx                  pick a question type (one of six)
            actions.ts                Server Action: insert + redirect to editor
          [qid]/
            page.tsx                  split-pane editor (Editor | Preview)
            actions.ts                Server Action: save question + variables
            actions-reorder.ts        Server Action: move ↑↓ (swap adjacent positions)
            actions-delete.ts         Server Action: delete question
  page.tsx                            home — extended to link to /assessments for instructors
```

### 2.2 Access control

- Unauthenticated → redirect to `/sign-in`.
- Authenticated but `role='student'` → 404 (do not reveal the route shape).
- Authenticated `role='instructor'` → render.

The 404-not-403 choice is intentional FERPA hardening: a student can't probe the URL surface to learn which instructor routes exist.

### 2.3 Navigation pattern

No global app header in Plan 2. Each instructor page has a small breadcrumb (`← Assessments`, `← Stoichiometry Quiz`). Sign-out stays on the home page. Plan 3's student-facing tree gets the same shell with a different role gate.

### 2.4 The six question types live at one editor route

`[qid]/page.tsx` dispatches on `questions.type` to render a type-specific scoring sub-form. One route, six sub-forms — not six routes. Type discrimination is driven by zod schemas (see §5).

---

## 3. The split-pane editor

### 3.1 Editor pane (left)

Single scrolling form, top-to-bottom:

1. **Meta strip** — read-only: position (`Q3 / 5`), type badge (`Numeric`). Type can't change (D7).
2. **Stem** — Markdown textarea. Supports:
   - `{{var}}` substitution (variable names resolve to materialized values at render time)
   - KaTeX inline `$...$` and display `$$...$$`
   - Standard Markdown
   - For `fill_in`: `{{blank:id}}` tokens that pair with scoring entries
3. **Type-specific scoring section** — dispatched on `questions.type`:
   - **mc** — list of choices (rows: id, label textarea, "is correct" radio); `+ Add choice`; min 2 choices, exactly 1 correct.
   - **ma** — same shape but "is correct" is per-row checkbox; "partial credit" toggle; min 2 choices, ≥ 1 correct.
   - **tf** — single radio: True / False.
   - **numeric** — grading-formula textarea + tolerance numeric input + optional units string. Formula is evaluated server-side on Save (via the TS evaluator) to ensure it parses and references only defined variables.
   - **short_answer** — regex pattern + case-insensitive toggle. Pattern is `new RegExp(...)`-validated on Save.
   - **fill_in** — blanks are inferred from `{{blank:id}}` tokens in the stem; per-blank row shows id + target + case-insensitive toggle. Drift between stem tokens and scoring targets is a field-level error.
4. **Variables section** (optional) — inline table, one row per variable: `[Name] [Type ▼] [▼ Configure] [×]`. Clicking ▼ expands the row to a type-dispatched spec form. Multiple rows can be expanded simultaneously (variables often interrelate through `derived` expressions, so the instructor will commonly want to see two or three at once). Spec sub-forms:
   - **choice** — one-value-per-line textarea
   - **chemistry_compound** — two-column rows: `label` + `smiles` (Ketcher integration is Wave 2; Plan 2 accepts hand-typed SMILES)
   - **randint** — min, max, step, units
   - **randfloat** — min, max, decimals, units
   - **derived** — expression textarea + live "evaluates to: …" hint computed against the current preview seed
5. **Action bar** sticky at the bottom: `[Save] [Save & Next] [Discard changes]`. `Save & Next` saves and navigates to the next question by position; disabled on the last question. `Discard changes` reverts the form to the last-saved state without leaving the route. `beforeunload` warning on unsaved-changes navigation away from the route.

### 3.2 Preview pane (right)

Top-to-bottom:

1. **Seed switcher** — dropdown with named test seeds: `Author (seed=0)`, `Test student 1 (seed=1)`, `Test student 2 (seed=2)`, `Test student 3 (seed=3)`, `Custom…` (text input). Switching re-runs the renderer; form state is unaffected.
2. **Rendered question** — stem with variables substituted, Markdown + math rendered, then the answer UI for the type (radios / checkboxes / inputs). Instructor can type answers; nothing is persisted, nothing is graded.
3. **Reveal panel** (collapsible, default open) — shows the materialized variable values, the computed grading target (`expected ≈ 2.40 ± 0.005` for numeric, `correct: B` for mc, etc.), and any validation errors that would block Save.

### 3.3 Live re-render

The form is React state. Every form change triggers a new `renderQuestion(...)` call on the client (the renderer is pure TS that runs identically in browser, RSC, and Node). No server round-trip per keystroke. The Server Action runs only on `Save`, where it re-validates server-side (defense in depth, against a tampered client) and persists.

---

## 4. The assessment overview page

`/(instructor)/assessments/[id]/page.tsx` combines settings editing and the question list on one page:

- **Settings card** at the top: title, slug, type (Quiz/Exam), status (Draft/Published), `time_limit_seconds` (Exam only), default attempts, opens_at, closes_at, randomize_questions, randomize_choices. Inline Save.
- **Questions table** below: position, type badge, first 80 chars of stem, `[↑]` `[↓]` `[Edit]` `[…⋮]` (delete).
- `+ Add question` button → `/questions/new` to pick a type.
- The assessment list page (`/assessments`) uses similar metadata cards: title, type, status, last-edited, question count.

Reorder = swap-adjacent (Server Action takes the question id + direction; flips the `position` of two adjacent rows in a transaction).

---

## 5. Persistence and validation

### 5.1 Per-type schemas (zod)

Each question type pins a `body` and `scoring` shape:

```
mc:
  body:    { stem: string, choices: { id: string, label: string }[], shuffle?: boolean }
  scoring: { correct_id: string, points?: number }

ma:
  body:    { stem: string, choices: { id: string, label: string }[], shuffle?: boolean }
  scoring: { correct_ids: string[], partial_credit?: boolean, points?: number }

tf:
  body:    { stem: string }
  scoring: { correct: boolean, points?: number }

numeric:
  body:    { stem: string, units?: string }
  scoring: { formula: string, tolerance: number, points?: number }

short_answer:
  body:    { stem: string }
  scoring: { pattern: string, case_insensitive?: boolean, points?: number }

fill_in:
  body:    { stem: string, blanks: { id: string, prompt?: string }[] }
  scoring: { targets: { id: string, target: string, case_insensitive?: boolean }[], points?: number }
```

Schemas live in `lib/schemas/questions.ts` and are imported by both Server Actions (for write-time validation) and the editor form (for client-side validation feedback).

### 5.1.1 Validation rules beyond schema shape

These rules are enforced by zod refinements layered onto the per-type schemas:

- **Stem** non-empty after trim.
- **mc:** `choices.length ≥ 2`, `choices[].id` unique, `scoring.correct_id` resolves to a choice id.
- **ma:** `choices.length ≥ 2`, `choices[].id` unique, `scoring.correct_ids` non-empty and every id resolves to a choice.
- **numeric:** `scoring.tolerance ≥ 0`; `scoring.formula` parses through the TS evaluator and references only variables defined for this question.
- **short_answer:** `scoring.pattern` is a valid JavaScript regular expression (verified via `new RegExp(...)` server-side, caught).
- **fill_in:** every `{{blank:id}}` token in the stem has a corresponding entry in `scoring.targets`, and every `scoring.targets[].id` has a corresponding stem token (set equality).
- **Variables:** see §5.2.

### 5.2 Variable schema

```
{ name: string,           // unique within question, matches /^[a-zA-Z_][a-zA-Z0-9_]*$/
  type: 'choice' | 'randint' | 'randfloat' | 'derived' | 'chemistry_compound',
  spec: <type-specific JSON>,
  position: number }
```

Validation includes:
- Variable names unique within a question; valid identifier pattern.
- `derived` expressions parse through the TS evaluator and reference only defined variables.
- `numeric.formula` likewise.
- `choice.values` non-empty; `chemistry_compound.values` each have non-empty `label` and `smiles`.
- `randint.min < max` and `randint.step >= 1`; `randfloat.min < max` and `decimals` in `[0, 10]`.

### 5.3 Server Action contract

Every Server Action:
1. `await createServerSupabaseClient()` to get an RLS-scoped client.
2. zod-parse the form payload.
3. Perform the DB write; rely on RLS for the authorization check (do not re-check ownership in app code).
4. On success: `revalidatePath('/(instructor)/assessments/[id]')` and `redirect` if appropriate.
5. On validation error: return structured `{ ok: false, errors: {...} }` for the form to render inline.

The Plan 1 RLS policies + SECURITY DEFINER helpers already guarantee that an instructor can only mutate their own assessments. Plan 2 piggybacks; no new policies are needed for the new operations.

---

## 6. The rendering pipeline (THE keystone — parent spec §4.4 / §7)

### 6.1 Modules

```
lib/
  rendering/
    types.ts               RenderInput, RenderOutput (discriminated by question type)
    render.ts              renderQuestion(input): RenderOutput  ← THE single function
    substitute.ts          {{var}} substitution into stem + choice labels
    md.tsx                 Markdown + KaTeX React component (consumes RenderOutput.rendered_stem)
    index.ts               barrel
  materializer/
    types.ts               MaterializedValue (number | string | CompoundValue), VariableSpec
    materialize.ts         materialize(specs, seed): Record<string, MaterializedValue>
    rng.ts                 seeded mulberry32 PRNG (~10 LOC, pure, deterministic)
    seed.ts                stableSeed({student_id, assessment_id, attempt_no}): number
  grading/
    formula.ts             evaluate(expr, vars): number   (TS sandbox)
    chem-data/
      periodic-table.json  element symbol → { Z, atomic_mass }
      molar-mass.ts        molarMass(formula): number     (parses "NaCl", "H2O", …)
      common-compounds.json label → { formula, density?, ... }
  schemas/
    questions.ts           zod schemas (see §5.1)
    variables.ts           zod schemas (see §5.2)
```

### 6.2 The render contract

```ts
export type RenderInput = {
  question: {
    type: QuestionType;
    body: QuestionBody;          // discriminated by type
    scoring: QuestionScoring;    // discriminated by type
    variables: VariableSpec[];   // 0..n
  };
  seed: number;
};

export type RenderOutput = {
  materialized_values: Record<string, MaterializedValue>;
  rendered_stem: string;         // post-substitution Markdown (rendered to HTML by the shared <Markdown /> component)
  rendered_body: RenderedBody;   // discriminated by question type; e.g. mc: { choices: [{ id, label_substituted }] }
  grading_target: GradingTarget; // numeric: { value, tolerance }; mc: { correct_id }; etc.
  validation_errors: string[];   // non-fatal; surfaced in the preview's Reveal panel
};
```

### 6.3 The single call site invariant

In Plan 2, `renderQuestion(...)` has exactly **one** call site: the split-pane preview pane. A Vitest invariant test (`lib/rendering/render.call-site.test.ts`) walks the source tree, parses `renderQuestion` import statements via `acorn`, and asserts the set of importing modules equals an allow-list. Adding a new caller without updating the allow-list fails CI. Plan 3 will append to the allow-list when the student attempt route lands.

### 6.4 Materializer determinism

- `materialize(specs, seed)` walks variables in `position` order (later ones can reference earlier ones via `derived`).
- PRNG: `mulberry32` seeded by `seed`. Same seed + same specs ⇒ same output, pinned by a table-driven test.
- `stableSeed({student_id, assessment_id, attempt_no})` uses `crypto.subtle.digest('SHA-256', ...)` and slices the first 53 bits — implemented in Plan 2 (with a unit test) so Plan 3 doesn't have to introduce the seed function.

### 6.5 Formula evaluator surface

- `evaluate(expr: string, vars: Record<string, number | CompoundValue>): number`
- Parser: `acorn`.
- **Allowed** AST nodes: `Literal`, `Identifier`, `BinaryExpression`, `UnaryExpression`, `CallExpression`, `LogicalExpression`, `ConditionalExpression` (`?:`), parenthesized.
- **Blocked** (throws `EvalError`): `MemberExpression`, `AssignmentExpression`, `FunctionExpression`, `ArrowFunctionExpression`, `NewExpression`, `ThisExpression`, `TemplateLiteral`, and anything else.
- **Allowed function names:** `sqrt`, `log` (natural log), `log10`, `exp`, `abs`, `sin`, `cos`, `tan`, `min`, `max`, `pow`, plus chem helpers `molar_mass(arg)`, `atomic_number(arg)`, `density(arg)`. Unknown call → `EvalError`.
- **Chem helpers** accept either a string (formula like `"NaCl"`) or a materialized `chemistry_compound` value `{ label, smiles }`. Plan 2 ships `periodic-table.json` (118 elements) and `common-compounds.json` (~30 compounds with densities). Unknown formula → `EvalError` with a clear message.

### 6.6 Substitution × Markdown × KaTeX ordering

`{{var}}` substitution runs **before** Markdown parsing — so a variable value of `$NaCl$` flows through KaTeX, a value of `# Heading` flows through MD. To prevent the instructor from injecting markup via a variable label (e.g. `<script>...</script>`), substituted values pass through MD's HTML-escape. A render test pins the escape (variable value `<script>alert(1)</script>` renders as inert text).

---

## 7. Data flow (Save and preview)

### 7.1 Editing flow (preview, every keystroke)

```
form state (React, Client Component)
  ↓ on every change
RenderInput { question, seed }                      seed comes from the seed switcher
  ↓
renderQuestion(input)                               pure, synchronous, runs in browser
  ↓
RenderOutput
  ↓
<PreviewSurface output={...} />                    Markdown → HTML, body → inputs, reveal panel
```

### 7.2 Save flow (one Server Action invocation)

```
form payload (Client Component on Save click)
  ↓ Server Action
zod-parse via lib/schemas/questions.ts + lib/schemas/variables.ts
  ↓ also run evaluate(formula, fake_vars) for numeric to confirm it parses
upsert questions row + delete/insert question_variables rows in one transaction
  ↓ revalidatePath  + redirect or return errors
```

---

## 8. Library additions

### 8.1 shadcn components (`npx shadcn add <name>`)

`card`, `dialog`, `dropdown-menu`, `select`, `table`, `tabs`, `textarea`, `toast` (Sonner), `badge`, `separator`, `breadcrumb`, `tooltip`. All inherit the existing `radix-nova` style — no re-init.

### 8.2 New npm dependencies

| Package | Why | Notes |
|---|---|---|
| `marked` | Markdown → HTML for stems | Lightweight; custom-renderer hook for math escaping. `unified`/`remark`/`rehype-katex` is ~10× heavier — not worth it for Plan 2. |
| `katex` | Math rendering (inline + display) + MathML output | MathML is the WCAG win — screen readers consume it natively per parent spec §4.2. |
| `acorn` | Parser for the sandboxed formula evaluator + the call-site manifest test | Already transitive via Next; promoting to direct dep stabilizes the version. Pure JS, runs identically in RSC + browser. |
| `zod` | Server Action schema validation | Standard pattern in App Router. Not yet in deps. |

No new deps for the PRNG (mulberry32 is ~10 LOC), seed hashing (Web Crypto `subtle.digest`), or chem data (static JSON).

---

## 9. Testing strategy

| Layer | Examples |
|---|---|
| **Vitest unit** | `lib/materializer/rng.test.ts` (PRNG output pinned for fixed seeds), `materialize.test.ts` (table-driven across all five var types), `seed.test.ts`, `lib/rendering/render.test.ts` (snapshot per type), `lib/rendering/substitute.test.ts` (escape edge cases), `lib/grading/formula.test.ts` (whitelist passes, blocklist throws), `lib/grading/chem-data/molar-mass.test.ts` (~20 common formulas), `lib/schemas/*.test.ts` (zod validation per type) |
| **Vitest invariant** | `lib/rendering/render.call-site.test.ts` — single-call-site manifest, parsed via `acorn` (spec §4.4 enforcement) |
| **Playwright auth+role** | `tests/auth/instructor-only-routes.spec.ts` — student GET `/(instructor)/assessments` returns 404 |
| **Playwright authoring E2E** | `tests/authoring/create-assessment.spec.ts`, `edit-numeric-question.spec.ts` (add var + derived grading target + preview re-render), `preview-seed-switch.spec.ts`, `validation-blocks-save.spec.ts` |
| **Playwright RLS** (extending Plan 1 patterns) | `tests/rls/assessments-owner-isolation.spec.ts`, `questions-owner-isolation.spec.ts`, `question-variables-owner-isolation.spec.ts` |
| **axe-core in CI** | New routes added to the fixed axe matrix: `/(instructor)/assessments`, `/assessments/new`, `/assessments/[id]`, `/assessments/[id]/questions/[qid]`. Build fails on any axe violation ≥ serious. |
| **Manual NVDA** before merge | Keyboard-only authoring of one parameterized numeric question end-to-end; runbook update at `docs/runbooks/nvda-test-script.md` |

---

## 10. Plan 2 success criteria

Plan 2 has shipped when:

1. **End-to-end author flow**: Instructor signs in, creates a quiz, authors a parameterized numeric question with one `randint` and one `derived` variable, saves it, switches the preview seed across three values and watches materialized values + grading target update — all in under five minutes, in one browser session, with no console errors and no axe violations.
2. **All listed tests pass on CI**: Vitest unit + invariant + zod + Playwright auth/authoring/RLS + axe.
3. **The renderer module has exactly one call site** (the manifest test passes).
4. **The Vercel preview deploy from the PR works end-to-end** — existing CI gating; nothing new required.

---

## 11. Out of scope for Plan 2 (deferred to listed plans)

- **Plan 3:** student route tree, `answers.rendered_question_snapshot` persistence, auto-grading loop (server-side, calls `evaluate(...)` for numeric, set-match for mc/ma, regex for short_answer, blank-match for fill_in), auto-save on student attempts, attempt CRUD, attempt submission. (The Plan 3 attempt loop covers quiz mode; the exam-mode timer is a separate Wave 3 concern.)
- **Plan 4:** gradebook, CSV export, image upload + Storage bucket signed-URL machinery, daily `pg_dump` backup automation, Cloudflare R2 wiring, Sentry with PII scrubbing, restore-drill rehearsal automation.
- **Wave 2:** Ketcher integration, RDKit-WASM client preview, RDKit Python server grader, `chem_draw_to_target`, `chem_pick_product`.
- **Wave 3:** server-authoritative exam timer, auto-submit on expiry, accommodations UI.
- **Wave 4:** `HasSubstructMatch` grading, functional-group-set grading, `chem_identify_functional_group`.
- **Phase 2:** multi-instructor admin UI, question-bank reuse across assessments, drag-and-drop reorder, in-place question-type change, weighted gradebook, audit-log viewer UI.

---

## 12. Risks carried into plan-writing

1. **`marked` + KaTeX in App Router (RSC + Client).** Both libs are pure JS, no Node deps; should work identically across runtimes. Plan must include one integration test before scaling out the renderer.
2. **`acorn` in production Vercel build.** Already transitive — pinning as direct dep + adding it to formula evaluator + manifest test increases its blast radius. Verify Vercel builds cleanly and the bundle size delta is acceptable.
3. **The manifest test's robustness.** A pure regex grep would suffice; the design specifies `acorn`-walked imports for rigor. Plan can downscale if grep is honestly enough.
4. **Variable spec UX with many derived dependencies.** A question with 5 variables and 3 layers of `derived` references could feel confusing in the inline-expand table. No design treatment in Plan 2 beyond "evaluates to:" hints; if it proves painful in dogfooding, polish goes into a follow-up plan.
5. **Bandwidth still 5–10 hrs/week.** Plan 2 task count is targeted at ~28–32; if execution slips, gracefully defer the polish-tier items (e.g. the `command` quick-jump, the `Save & Next` shortcut, the seed switcher's "Custom…" input) without breaking the success criteria.

---

_End of Plan 2 design spec._
