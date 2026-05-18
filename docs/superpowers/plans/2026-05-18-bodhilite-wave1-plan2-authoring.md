# BodhiLite Wave 1 Plan 2 — Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the instructor-facing authoring surface for Wave 1 — assessment CRUD, six standard objective question types, parameterized variables with deterministic materialization, sandboxed formula evaluation, and an interactive split-pane preview — all behind RLS, all WCAG 2.2 AA clean, no student-facing surface, no persistence of student attempts.

**Architecture:** Pure-TS keystone modules (`lib/rendering/`, `lib/materializer/`, `lib/grading/`, `lib/schemas/`) drive both the editor and the preview. The renderer is the single source of truth for question display (call-site manifest enforced by a Vitest invariant test). All write paths go through Server Actions that zod-validate then trust RLS for authorization. No new migrations — Plan 1's schema is sufficient.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict-plus, Tailwind v4, shadcn (radix-nova), Supabase Postgres + Auth, `marked` + `katex` for stem rendering, `acorn` for the sandboxed formula parser, `zod` for schema validation, Vitest + Playwright + axe-core for tests.

**Parent spec:** [`../specs/2026-05-18-bodhilite-wave1-plan2-authoring-design.md`](../specs/2026-05-18-bodhilite-wave1-plan2-authoring-design.md)

---

## File map

Files this plan creates or touches:

```
lib/
  rng/
    mulberry32.ts                   ★ new
    mulberry32.test.ts              ★ new
  materializer/
    types.ts                        ★ new
    seed.ts                         ★ new
    seed.test.ts                    ★ new
    materialize.ts                  ★ new
    materialize.test.ts             ★ new
    index.ts                        ★ new
  grading/
    formula.ts                      ★ new
    formula.test.ts                 ★ new
    chem-data/
      periodic-table.json           ★ new
      common-compounds.json         ★ new
      molar-mass.ts                 ★ new
      molar-mass.test.ts            ★ new
    index.ts                        ★ new
  rendering/
    types.ts                        ★ new
    substitute.ts                   ★ new
    substitute.test.ts              ★ new
    md.tsx                          ★ new
    md.test.tsx                     ★ new
    render.ts                       ★ new
    render.test.ts                  ★ new
    render.call-site.test.ts        ★ new
    index.ts                        ★ new
  schemas/
    questions.ts                    ★ new
    questions.test.ts               ★ new
    variables.ts                    ★ new
    variables.test.ts               ★ new
    index.ts                        ★ new

app/
  page.tsx                          ☆ modify (add instructor link)
  (instructor)/
    layout.tsx                      ★ new (role guard)
    assessments/
      page.tsx                      ★ new (list)
      new/
        page.tsx                    ★ new (create form)
        actions.ts                  ★ new
      [id]/
        page.tsx                    ★ new (overview)
        edit-settings/
          actions.ts                ★ new
        questions/
          new/
            page.tsx                ★ new (type picker)
            actions.ts              ★ new
          [qid]/
            page.tsx                ★ new (split-pane editor)
            actions.ts              ★ new
            actions-reorder.ts      ★ new
            actions-delete.ts       ★ new

components/
  ui/                               ☆ shadcn adds (card, dialog, etc.)
  editor/
    EditorPane.tsx                  ★ new
    StemField.tsx                   ★ new
    ActionBar.tsx                   ★ new
    scoring-forms.tsx               ★ new (6 named exports)
    VariablesSection.tsx            ★ new
    variable-specs.tsx              ★ new (5 named exports)
  preview/
    PreviewPane.tsx                 ★ new
    SeedSwitcher.tsx                ★ new
    RevealPanel.tsx                 ★ new
    answer-surfaces.tsx             ★ new (6 named exports)
  assessments/
    AssessmentCard.tsx              ★ new
    SettingsForm.tsx                ★ new
    QuestionsTable.tsx              ★ new
    TypePicker.tsx                  ★ new

tests/
  helpers/
    browser-session.ts              ★ new (Playwright auth helper)
    instructor.ts                   ★ new
  authoring/
    create-assessment.spec.ts       ★ new
    edit-numeric-question.spec.ts   ★ new
    preview-seed-switch.spec.ts     ★ new
    validation-blocks-save.spec.ts  ★ new
  auth/
    instructor-only-routes.spec.ts  ★ new
  a11y/
    assessments-list.spec.ts        ★ new
    assessment-new.spec.ts          ★ new
    assessment-edit.spec.ts         ★ new
    question-editor.spec.ts         ★ new
  rls/
    assessments-isolation.spec.ts   ★ new
    questions-isolation.spec.ts     ★ new
    question-variables-isolation.spec.ts  ★ new

docs/
  runbooks/
    nvda-test-script.md             ☆ modify (Plan 2 critical path)
```

34 tasks. Each task = one atomic commit.

---

### Task 1: Install npm dependencies (marked, katex, acorn, zod)

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime deps**

Run: `npm install marked katex acorn zod`

Expected: four packages added under `dependencies` in `package.json`. No peer-dep warnings that block install.

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add marked, katex, acorn, zod for Plan 2 authoring"
```

---

### Task 2: Add shadcn components for Plan 2

**Files:**
- Create: `components/ui/{card,dialog,dropdown-menu,select,table,tabs,textarea,sonner,badge,separator,breadcrumb,tooltip}.tsx`

- [ ] **Step 1: Add components in one batch**

Run:
```bash
npx --yes shadcn@latest add card dialog dropdown-menu select table tabs textarea sonner badge separator breadcrumb tooltip
```

Expected: 12 files written under `components/ui/`. The CLI inherits the `radix-nova` style from `components.json` — confirm Radix-based imports (`from 'radix-ui'`) in each generated file.

- [ ] **Step 2: Verify lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/ui/
git commit -m "feat(ui): add shadcn primitives (card, dialog, dropdown, select, table, tabs, textarea, sonner, badge, separator, breadcrumb, tooltip)"
```

---

### Task 3: Implement seeded PRNG (mulberry32) with TDD

**Files:**
- Create: `lib/rng/mulberry32.ts`
- Test:   `lib/rng/mulberry32.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/rng/mulberry32.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mulberry32 } from './mulberry32';

describe('mulberry32', () => {
  it('returns a deterministic sequence for a fixed seed', () => {
    const rng = mulberry32(42);
    expect(rng()).toBeCloseTo(0.6011037519201636, 12);
    expect(rng()).toBeCloseTo(0.44829055899754167, 12);
    expect(rng()).toBeCloseTo(0.32228760351426899, 12);
  });

  it('two PRNGs seeded identically produce identical sequences', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('different seeds diverge by the first draw', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('all draws are in [0, 1)', () => {
    const rng = mulberry32(0);
    for (let i = 0; i < 10_000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/rng/mulberry32.test.ts`
Expected: FAIL — `Cannot find module './mulberry32'`

- [ ] **Step 3: Implement**

Create `lib/rng/mulberry32.ts`:

```ts
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

> Note: the pinned values in Step 1 come from this exact implementation; if a later step changes the algorithm, regenerate them from the implementation, never the other way around.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/rng/mulberry32.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/rng/
git commit -m "feat(rng): seeded mulberry32 PRNG for deterministic materialization"
```

---

### Task 4: Implement stableSeed with TDD

**Files:**
- Create: `lib/materializer/seed.ts`
- Test:   `lib/materializer/seed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/materializer/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stableSeed } from './seed';

describe('stableSeed', () => {
  const fixture = {
    student_id: '00000000-0000-0000-0000-000000000001',
    assessment_id: '00000000-0000-0000-0000-000000000002',
    attempt_no: 1,
  };

  it('is deterministic for fixed inputs', async () => {
    const a = await stableSeed(fixture);
    const b = await stableSeed(fixture);
    expect(a).toBe(b);
  });

  it('differs when attempt_no changes', async () => {
    const a = await stableSeed(fixture);
    const b = await stableSeed({ ...fixture, attempt_no: 2 });
    expect(a).not.toBe(b);
  });

  it('differs when student_id changes', async () => {
    const a = await stableSeed(fixture);
    const b = await stableSeed({
      ...fixture,
      student_id: '00000000-0000-0000-0000-000000000003',
    });
    expect(a).not.toBe(b);
  });

  it('produces a finite non-negative integer < 2^53', async () => {
    const s = await stableSeed(fixture);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/materializer/seed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/materializer/seed.ts`:

```ts
export type SeedInput = {
  student_id: string;
  assessment_id: string;
  attempt_no: number;
};

export async function stableSeed(input: SeedInput): Promise<number> {
  const key = `${input.student_id}|${input.assessment_id}|${input.attempt_no}`;
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);

  // Take first 7 bytes (56 bits) and mask to 53 bits to stay within
  // Number.MAX_SAFE_INTEGER without losing precision.
  let seed = 0;
  for (let i = 0; i < 7; i++) {
    seed = seed * 256 + bytes[i]!;
  }
  return seed % Number.MAX_SAFE_INTEGER;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/materializer/seed.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/materializer/seed.ts lib/materializer/seed.test.ts
git commit -m "feat(materializer): stableSeed (SHA-256, 53-bit) for deterministic student attempts"
```

---

### Task 5: Variable spec zod schemas

**Files:**
- Create: `lib/schemas/variables.ts`
- Test:   `lib/schemas/variables.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/schemas/variables.test.ts` with cases for:
- accepts valid `choice`, `chemistry_compound`, `randint`, `randfloat`, `derived` specs
- rejects: identifier-violating name (`1bad`), `randint` with `min >= max`, empty `choice.values`, `chemistry_compound` with empty `label`, empty `derived.expression`

Test code template:

```ts
import { describe, it, expect } from 'vitest';
import { VariableSpecSchema } from './variables';

describe('VariableSpecSchema', () => {
  it('accepts a valid choice spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'compound',
      type: 'choice',
      position: 1,
      spec: { values: ['NaCl', 'KCl', 'CaCl2'] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid chemistry_compound spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'salt',
      type: 'chemistry_compound',
      position: 1,
      spec: {
        values: [
          { label: 'NaCl', smiles: '[Na+].[Cl-]' },
          { label: 'KBr', smiles: '[K+].[Br-]' },
        ],
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid randint spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'mass',
      type: 'randint',
      position: 2,
      spec: { min: 10, max: 200, step: 5, units: 'g' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid randfloat spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'volume',
      type: 'randfloat',
      position: 2,
      spec: { min: 0.1, max: 10, decimals: 2, units: 'L' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid derived spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'moles',
      type: 'derived',
      position: 3,
      spec: { expression: 'mass / molar_mass(compound)' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid name', () => {
    const r = VariableSpecSchema.safeParse({
      name: '1bad',
      type: 'choice',
      position: 1,
      spec: { values: ['a'] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects randint with min >= max', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'x',
      type: 'randint',
      position: 1,
      spec: { min: 10, max: 5 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty choice values array', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'x',
      type: 'choice',
      position: 1,
      spec: { values: [] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects chemistry_compound with empty label', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'x',
      type: 'chemistry_compound',
      position: 1,
      spec: { values: [{ label: '', smiles: 'C' }] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects derived with empty expression', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'x',
      type: 'derived',
      position: 1,
      spec: { expression: '' },
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/schemas/variables.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/schemas/variables.ts`:

```ts
import { z } from 'zod';

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const ChoiceSpec = z.object({
  values: z.array(z.string().min(1)).min(1),
});

const ChemistryCompoundSpec = z.object({
  values: z
    .array(
      z.object({
        label: z.string().min(1),
        smiles: z.string().min(1),
      }),
    )
    .min(1),
});

const RandintSpec = z
  .object({
    min: z.number().int(),
    max: z.number().int(),
    step: z.number().int().min(1).optional(),
    units: z.string().optional(),
  })
  .refine((s) => s.min < s.max, { message: 'min must be < max' });

const RandfloatSpec = z
  .object({
    min: z.number(),
    max: z.number(),
    decimals: z.number().int().min(0).max(10).optional(),
    units: z.string().optional(),
  })
  .refine((s) => s.min < s.max, { message: 'min must be < max' });

const DerivedSpec = z.object({
  expression: z.string().min(1),
});

export const VariableSpecSchema = z.discriminatedUnion('type', [
  z.object({
    name: z.string().regex(IDENT),
    position: z.number().int().min(1),
    type: z.literal('choice'),
    spec: ChoiceSpec,
  }),
  z.object({
    name: z.string().regex(IDENT),
    position: z.number().int().min(1),
    type: z.literal('chemistry_compound'),
    spec: ChemistryCompoundSpec,
  }),
  z.object({
    name: z.string().regex(IDENT),
    position: z.number().int().min(1),
    type: z.literal('randint'),
    spec: RandintSpec,
  }),
  z.object({
    name: z.string().regex(IDENT),
    position: z.number().int().min(1),
    type: z.literal('randfloat'),
    spec: RandfloatSpec,
  }),
  z.object({
    name: z.string().regex(IDENT),
    position: z.number().int().min(1),
    type: z.literal('derived'),
    spec: DerivedSpec,
  }),
]);

export type VariableSpec = z.infer<typeof VariableSpecSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/schemas/variables.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/schemas/variables.ts lib/schemas/variables.test.ts
git commit -m "feat(schemas): zod schemas for the 5 variable spec types"
```

---

### Task 6: Materializer for 4 non-derived variable types

**Files:**
- Create: `lib/materializer/types.ts`
- Create: `lib/materializer/materialize.ts`
- Test:   `lib/materializer/materialize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/materializer/materialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { materialize } from './materialize';
import type { VariableSpec } from '@/lib/schemas/variables';

describe('materialize — non-derived types', () => {
  it('choice picks deterministically for a fixed seed', () => {
    const specs: VariableSpec[] = [
      { name: 'x', type: 'choice', position: 1, spec: { values: ['a', 'b', 'c'] } },
    ];
    const out = materialize(specs, 42);
    expect(out.x).toBe('c');
  });

  it('chemistry_compound returns the {label, smiles} object', () => {
    const specs: VariableSpec[] = [
      {
        name: 'salt',
        type: 'chemistry_compound',
        position: 1,
        spec: {
          values: [
            { label: 'NaCl', smiles: '[Na+].[Cl-]' },
            { label: 'KBr', smiles: '[K+].[Br-]' },
          ],
        },
      },
    ];
    const out = materialize(specs, 1);
    expect(out.salt).toEqual(
      expect.objectContaining({ label: expect.any(String), smiles: expect.any(String) }),
    );
  });

  it('randint respects step and bounds', () => {
    const specs: VariableSpec[] = [
      { name: 'm', type: 'randint', position: 1, spec: { min: 10, max: 100, step: 5 } },
    ];
    for (let seed = 0; seed < 100; seed++) {
      const v = materialize(specs, seed).m as number;
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(100);
      expect((v - 10) % 5).toBe(0);
    }
  });

  it('randfloat respects decimals and bounds', () => {
    const specs: VariableSpec[] = [
      { name: 'v', type: 'randfloat', position: 1, spec: { min: 0, max: 1, decimals: 2 } },
    ];
    for (let seed = 0; seed < 100; seed++) {
      const v = materialize(specs, seed).v as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-9);
    }
  });

  it('same seed + same specs ⇒ same output', () => {
    const specs: VariableSpec[] = [
      { name: 'a', type: 'choice', position: 1, spec: { values: ['x', 'y'] } },
      { name: 'b', type: 'randint', position: 2, spec: { min: 1, max: 10 } },
    ];
    const r1 = materialize(specs, 7);
    const r2 = materialize(specs, 7);
    expect(r1).toEqual(r2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/materializer/materialize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types**

Create `lib/materializer/types.ts`:

```ts
export type CompoundValue = { label: string; smiles: string };
export type MaterializedValue = number | string | CompoundValue;
export type MaterializedValues = Record<string, MaterializedValue>;
```

- [ ] **Step 4: Implement materializer (non-derived only)**

Create `lib/materializer/materialize.ts`:

```ts
import { mulberry32 } from '@/lib/rng/mulberry32';
import type { VariableSpec } from '@/lib/schemas/variables';
import type { MaterializedValues, MaterializedValue } from './types';

export function materialize(specs: VariableSpec[], seed: number): MaterializedValues {
  const rng = mulberry32(seed);
  const ordered = [...specs].sort((a, b) => a.position - b.position);
  const out: MaterializedValues = {};

  for (const v of ordered) {
    out[v.name] = materializeOne(v, rng, out);
  }
  return out;
}

function materializeOne(
  v: VariableSpec,
  rng: () => number,
  _scope: MaterializedValues,
): MaterializedValue {
  switch (v.type) {
    case 'choice': {
      const values = v.spec.values;
      return values[Math.floor(rng() * values.length)]!;
    }
    case 'chemistry_compound': {
      const values = v.spec.values;
      return values[Math.floor(rng() * values.length)]!;
    }
    case 'randint': {
      const { min, max, step } = v.spec;
      if (step && step > 1) {
        const buckets = Math.floor((max - min) / step) + 1;
        return min + Math.floor(rng() * buckets) * step;
      }
      return min + Math.floor(rng() * (max - min + 1));
    }
    case 'randfloat': {
      const { min, max, decimals } = v.spec;
      const raw = min + rng() * (max - min);
      if (decimals == null) return raw;
      const f = 10 ** decimals;
      return Math.round(raw * f) / f;
    }
    case 'derived': {
      // Implemented in Task 9
      throw new Error('derived variables not yet supported');
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/materializer/materialize.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/materializer/types.ts lib/materializer/materialize.ts lib/materializer/materialize.test.ts
git commit -m "feat(materializer): deterministic materialization for choice, chemistry_compound, randint, randfloat"
```

---

### Task 7: Chem data + molar_mass

**Files:**
- Create: `lib/grading/chem-data/periodic-table.json` (full 118 elements; abbreviated example below)
- Create: `lib/grading/chem-data/common-compounds.json` (~30 compounds with densities)
- Create: `lib/grading/chem-data/molar-mass.ts`
- Test:   `lib/grading/chem-data/molar-mass.test.ts`

- [ ] **Step 1: Create the periodic-table JSON**

Use IUPAC 2021 standard atomic weights. Full file must contain all 118 elements; abbreviated start:

```json
{
  "H":  { "Z": 1,   "atomic_mass": 1.008 },
  "He": { "Z": 2,   "atomic_mass": 4.0026 },
  "Li": { "Z": 3,   "atomic_mass": 6.94 },
  "Be": { "Z": 4,   "atomic_mass": 9.0122 },
  "B":  { "Z": 5,   "atomic_mass": 10.81 },
  "C":  { "Z": 6,   "atomic_mass": 12.011 },
  "N":  { "Z": 7,   "atomic_mass": 14.007 },
  "O":  { "Z": 8,   "atomic_mass": 15.999 },
  "F":  { "Z": 9,   "atomic_mass": 18.998 },
  "Ne": { "Z": 10,  "atomic_mass": 20.180 },
  "Na": { "Z": 11,  "atomic_mass": 22.990 },
  "Mg": { "Z": 12,  "atomic_mass": 24.305 },
  "Al": { "Z": 13,  "atomic_mass": 26.982 },
  "Si": { "Z": 14,  "atomic_mass": 28.085 },
  "P":  { "Z": 15,  "atomic_mass": 30.974 },
  "S":  { "Z": 16,  "atomic_mass": 32.06 },
  "Cl": { "Z": 17,  "atomic_mass": 35.45 },
  "Ar": { "Z": 18,  "atomic_mass": 39.948 },
  "K":  { "Z": 19,  "atomic_mass": 39.098 },
  "Ca": { "Z": 20,  "atomic_mass": 40.078 }
  /* ... continue through element 118 (Og) ... */
}
```

The full JSON must validate via `JSON.parse` and contain all 118 entries with IUPAC symbols. Source: NIST or any standard chemistry reference.

- [ ] **Step 2: Create the common-compounds JSON**

Create `lib/grading/chem-data/common-compounds.json`:

```json
{
  "NaCl":   { "formula": "NaCl",   "density": 2.165 },
  "KCl":    { "formula": "KCl",    "density": 1.984 },
  "CaCO3":  { "formula": "CaCO3",  "density": 2.711 },
  "H2O":    { "formula": "H2O",    "density": 0.997 },
  "NaOH":   { "formula": "NaOH",   "density": 2.13 },
  "HCl":    { "formula": "HCl",    "density": 1.49 },
  "H2SO4":  { "formula": "H2SO4",  "density": 1.84 },
  "HNO3":   { "formula": "HNO3",   "density": 1.51 },
  "CO2":    { "formula": "CO2",    "density": 0.001977 },
  "O2":     { "formula": "O2",     "density": 0.001429 },
  "N2":     { "formula": "N2",     "density": 0.001251 },
  "CH4":    { "formula": "CH4",    "density": 0.000657 },
  "C2H6":   { "formula": "C2H6",   "density": 0.001263 },
  "C3H8":   { "formula": "C3H8",   "density": 0.002009 },
  "CH3OH":  { "formula": "CH3OH",  "density": 0.7918 },
  "C2H5OH": { "formula": "C2H5OH", "density": 0.789 },
  "C6H12O6":{ "formula": "C6H12O6","density": 1.54 },
  "CaCl2":  { "formula": "CaCl2",  "density": 2.15 },
  "MgO":    { "formula": "MgO",    "density": 3.58 },
  "MgSO4":  { "formula": "MgSO4",  "density": 2.66 },
  "Fe2O3":  { "formula": "Fe2O3",  "density": 5.24 },
  "Al2O3":  { "formula": "Al2O3",  "density": 3.95 },
  "SiO2":   { "formula": "SiO2",   "density": 2.65 },
  "NH3":    { "formula": "NH3",    "density": 0.000769 },
  "NH4Cl":  { "formula": "NH4Cl",  "density": 1.53 },
  "KMnO4":  { "formula": "KMnO4",  "density": 2.703 },
  "K2Cr2O7":{ "formula": "K2Cr2O7","density": 2.676 },
  "CuSO4":  { "formula": "CuSO4",  "density": 3.6 },
  "AgNO3":  { "formula": "AgNO3",  "density": 4.35 },
  "PbI2":   { "formula": "PbI2",   "density": 6.16 }
}
```

- [ ] **Step 3: Write the failing molar-mass test**

Create `lib/grading/chem-data/molar-mass.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { molarMass } from './molar-mass';

describe('molarMass', () => {
  it.each([
    ['H',        1.008],
    ['H2',       2.016],
    ['H2O',      18.015],
    ['CO2',      44.009],
    ['NaCl',     58.44],
    ['CaCO3',    100.087],
    ['NaOH',     39.997],
    ['H2SO4',    98.072],
    ['Mg(OH)2',  58.319],
    ['Ca(OH)2',  74.092],
    ['Al2(SO4)3', 342.151],
    ['C6H12O6',  180.156],
    ['NH4NO3',   80.043],
    ['(NH4)2SO4', 132.134],
    ['CuSO4',    159.609],
    ['KMnO4',    158.034],
    ['K2Cr2O7',  294.184],
  ])('molarMass(%s) ≈ %f', (formula, expected) => {
    expect(molarMass(formula)).toBeCloseTo(expected, 2);
  });

  it('throws on unknown element', () => {
    expect(() => molarMass('Xy2')).toThrow();
  });

  it('throws on malformed formula', () => {
    expect(() => molarMass('123abc')).toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run lib/grading/chem-data/molar-mass.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement molarMass**

Create `lib/grading/chem-data/molar-mass.ts`:

```ts
import periodic from './periodic-table.json' with { type: 'json' };

type Element = { Z: number; atomic_mass: number };
const ELEMENTS = periodic as Record<string, Element>;

/**
 * Parse a chemical formula and return its molar mass (g/mol).
 * Supports nested parentheses with integer multipliers.
 */
export function molarMass(formula: string): number {
  if (!formula || !/^[A-Za-z0-9()]+$/.test(formula)) {
    throw new Error(`Malformed formula: ${formula}`);
  }
  const counts = parse(formula);
  let mass = 0;
  for (const [el, n] of counts.entries()) {
    const e = ELEMENTS[el];
    if (!e) throw new Error(`Unknown element: ${el}`);
    mass += e.atomic_mass * n;
  }
  return mass;
}

function parse(formula: string): Map<string, number> {
  let i = 0;
  const counts = new Map<string, number>();

  function readInt(): number {
    const start = i;
    while (i < formula.length && formula[i]! >= '0' && formula[i]! <= '9') i++;
    return start === i ? 1 : parseInt(formula.slice(start, i), 10);
  }

  function readElement(): string {
    const start = i;
    if (!(formula[i]! >= 'A' && formula[i]! <= 'Z')) {
      throw new Error(`Expected element at position ${i} of ${formula}`);
    }
    i++;
    while (i < formula.length && formula[i]! >= 'a' && formula[i]! <= 'z') i++;
    return formula.slice(start, i);
  }

  function readGroup(): Map<string, number> {
    const inner = new Map<string, number>();
    while (i < formula.length && formula[i] !== ')') {
      if (formula[i] === '(') {
        i++;
        const sub = readGroup();
        if (formula[i] !== ')') throw new Error(`Unbalanced ( in ${formula}`);
        i++;
        const mult = readInt();
        for (const [k, v] of sub.entries()) {
          inner.set(k, (inner.get(k) ?? 0) + v * mult);
        }
      } else {
        const el = readElement();
        const n = readInt();
        inner.set(el, (inner.get(el) ?? 0) + n);
      }
    }
    return inner;
  }

  const top = readGroup();
  if (i !== formula.length) throw new Error(`Unparsed trailing characters in ${formula}`);
  for (const [k, v] of top.entries()) counts.set(k, (counts.get(k) ?? 0) + v);
  return counts;
}
```

> If TS complains about `with { type: 'json' }`, fall back to `import periodic from './periodic-table.json'` — Next's bundler handles JSON natively.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/grading/chem-data/molar-mass.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/grading/chem-data/
git commit -m "feat(grading): periodic table, common-compounds data, molar_mass implementation"
```

---

### Task 8: Sandboxed formula evaluator (acorn-based)

**Files:**
- Create: `lib/grading/formula.ts`
- Test:   `lib/grading/formula.test.ts`
- Create: `lib/grading/index.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/grading/formula.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluate, EvalError } from './formula';

const vars = { a: 3, b: 4, m: 25, compound: { label: 'NaCl', smiles: '[Na+].[Cl-]' } };

describe('evaluate — arithmetic', () => {
  it('handles basic arithmetic', () => {
    expect(evaluate('a + b', vars)).toBe(7);
    expect(evaluate('a * b', vars)).toBe(12);
    expect(evaluate('b - a', vars)).toBe(1);
    expect(evaluate('b / a', vars)).toBeCloseTo(1.333, 3);
    expect(evaluate('a ** 2', vars)).toBe(9);
  });

  it('handles parenthesization', () => {
    expect(evaluate('(a + b) * 2', vars)).toBe(14);
  });

  it('handles unary minus', () => {
    expect(evaluate('-a + b', vars)).toBe(1);
  });
});

describe('evaluate — whitelisted functions', () => {
  it('handles sqrt, log, exp, abs', () => {
    expect(evaluate('sqrt(16)', vars)).toBe(4);
    expect(evaluate('log(exp(1))', vars)).toBeCloseTo(1, 10);
    expect(evaluate('log10(100)', vars)).toBeCloseTo(2, 10);
    expect(evaluate('abs(-5)', vars)).toBe(5);
  });

  it('handles trig functions', () => {
    expect(evaluate('sin(0)', vars)).toBe(0);
    expect(evaluate('cos(0)', vars)).toBe(1);
  });

  it('handles min, max, pow', () => {
    expect(evaluate('min(2, 7)', vars)).toBe(2);
    expect(evaluate('max(2, 7)', vars)).toBe(7);
    expect(evaluate('pow(2, 8)', vars)).toBe(256);
  });

  it('handles molar_mass on a formula string literal', () => {
    expect(evaluate('molar_mass("NaCl")', vars)).toBeCloseTo(58.44, 2);
  });

  it('handles molar_mass on a chemistry_compound variable', () => {
    expect(evaluate('molar_mass(compound)', vars)).toBeCloseTo(58.44, 2);
  });

  it('handles atomic_number', () => {
    expect(evaluate('atomic_number("Fe")', vars)).toBe(26);
  });

  it('handles density on known compound', () => {
    expect(evaluate('density("H2O")', vars)).toBeCloseTo(0.997, 3);
  });
});

describe('evaluate — sandbox rejections', () => {
  it('rejects member access', () => {
    expect(() => evaluate('a.constructor', vars)).toThrow(EvalError);
  });

  it('rejects assignment', () => {
    expect(() => evaluate('a = 5', vars)).toThrow();
  });

  it('rejects unknown function', () => {
    expect(() => evaluate('unknown_fn(1)', vars)).toThrow(EvalError);
  });

  it('rejects unknown variable', () => {
    expect(() => evaluate('unknown', vars)).toThrow(EvalError);
  });

  it('rejects function literal call', () => {
    expect(() => evaluate('(() => 1)()', vars)).toThrow();
  });

  it('rejects template literal', () => {
    expect(() => evaluate('`hello`', vars)).toThrow();
  });

  it('rejects new expression', () => {
    expect(() => evaluate('new Date()', vars)).toThrow();
  });

  it('rejects this', () => {
    expect(() => evaluate('this', vars)).toThrow();
  });

  it('rejects bracket member access', () => {
    expect(() => evaluate('a["constructor"]', vars)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/grading/formula.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement evaluator**

Create `lib/grading/formula.ts`:

```ts
import * as acorn from 'acorn';
import type { CompoundValue, MaterializedValue } from '@/lib/materializer/types';
import { molarMass } from './chem-data/molar-mass';
import periodic from './chem-data/periodic-table.json' with { type: 'json' };
import compounds from './chem-data/common-compounds.json' with { type: 'json' };

export class EvalError extends Error {
  override name = 'EvalError';
}

type Vars = Record<string, MaterializedValue>;
type AllowedFn = (...args: unknown[]) => number;

const FUNCS: Record<string, AllowedFn> = {
  sqrt: (x) => Math.sqrt(asNumber(x)),
  log: (x) => Math.log(asNumber(x)),
  log10: (x) => Math.log10(asNumber(x)),
  exp: (x) => Math.exp(asNumber(x)),
  abs: (x) => Math.abs(asNumber(x)),
  sin: (x) => Math.sin(asNumber(x)),
  cos: (x) => Math.cos(asNumber(x)),
  tan: (x) => Math.tan(asNumber(x)),
  min: (...xs) => Math.min(...xs.map(asNumber)),
  max: (...xs) => Math.max(...xs.map(asNumber)),
  pow: (b, e) => Math.pow(asNumber(b), asNumber(e)),
  molar_mass: (arg) => molarMass(asFormula(arg)),
  atomic_number: (arg) => {
    const sym = asString(arg);
    const e = (periodic as Record<string, { Z: number }>)[sym];
    if (!e) throw new EvalError(`Unknown element: ${sym}`);
    return e.Z;
  },
  density: (arg) => {
    const key = asString(arg);
    const c = (compounds as Record<string, { density?: number }>)[key];
    if (!c?.density) throw new EvalError(`Unknown compound density: ${key}`);
    return c.density;
  },
};

function asNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  throw new EvalError(`Expected number, got ${typeof v}`);
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isCompound(v)) return v.label;
  throw new EvalError(`Expected string or compound, got ${typeof v}`);
}

function asFormula(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isCompound(v)) return v.label;
  throw new EvalError(`Expected formula string or chemistry_compound, got ${typeof v}`);
}

function isCompound(v: unknown): v is CompoundValue {
  return typeof v === 'object' && v !== null && 'smiles' in v && 'label' in v;
}

export function evaluate(expr: string, vars: Vars): number {
  let ast: acorn.Expression;
  try {
    ast = acorn.parseExpressionAt(expr, 0, {
      ecmaVersion: 2020,
      sourceType: 'script',
    }) as unknown as acorn.Expression;
  } catch (e) {
    throw new EvalError(`Parse error: ${(e as Error).message}`);
  }
  return asNumber(walk(ast as Node, vars));
}

type Node = acorn.Node & { type: string };

function walk(node: Node, vars: Vars): unknown {
  switch (node.type) {
    case 'Literal': {
      const n = node as unknown as { value: unknown };
      if (typeof n.value === 'number' || typeof n.value === 'string') return n.value;
      throw new EvalError(`Unsupported literal: ${JSON.stringify(n.value)}`);
    }
    case 'Identifier': {
      const n = node as unknown as { name: string };
      if (!(n.name in vars)) throw new EvalError(`Unknown variable: ${n.name}`);
      return vars[n.name];
    }
    case 'BinaryExpression': {
      const n = node as unknown as { operator: string; left: Node; right: Node };
      const l = asNumber(walk(n.left, vars));
      const r = asNumber(walk(n.right, vars));
      switch (n.operator) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '**': return l ** r;
        case '%': return l % r;
        case '<': return l < r ? 1 : 0;
        case '<=': return l <= r ? 1 : 0;
        case '>': return l > r ? 1 : 0;
        case '>=': return l >= r ? 1 : 0;
        case '==': return l === r ? 1 : 0;
        case '!=': return l !== r ? 1 : 0;
        default: throw new EvalError(`Unsupported operator: ${n.operator}`);
      }
    }
    case 'UnaryExpression': {
      const n = node as unknown as { operator: string; argument: Node };
      const v = asNumber(walk(n.argument, vars));
      if (n.operator === '-') return -v;
      if (n.operator === '+') return +v;
      throw new EvalError(`Unsupported unary: ${n.operator}`);
    }
    case 'LogicalExpression': {
      const n = node as unknown as { operator: string; left: Node; right: Node };
      const l = asNumber(walk(n.left, vars));
      if (n.operator === '&&') return l ? walk(n.right, vars) : l;
      if (n.operator === '||') return l ? l : walk(n.right, vars);
      throw new EvalError(`Unsupported logical: ${n.operator}`);
    }
    case 'ConditionalExpression': {
      const n = node as unknown as { test: Node; consequent: Node; alternate: Node };
      const t = asNumber(walk(n.test, vars));
      return t ? walk(n.consequent, vars) : walk(n.alternate, vars);
    }
    case 'CallExpression': {
      const n = node as unknown as { callee: Node; arguments: Node[] };
      if (n.callee.type !== 'Identifier') {
        throw new EvalError('Only direct function calls allowed');
      }
      const name = (n.callee as unknown as { name: string }).name;
      const fn = FUNCS[name];
      if (!fn) throw new EvalError(`Unknown function: ${name}`);
      const args = n.arguments.map((a) => walk(a, vars));
      return fn(...args);
    }
    default:
      throw new EvalError(`Disallowed AST node: ${node.type}`);
  }
}
```

- [ ] **Step 4: Add barrel**

Create `lib/grading/index.ts`:

```ts
export { evaluate, EvalError } from './formula';
export { molarMass } from './chem-data/molar-mass';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/grading/formula.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add lib/grading/formula.ts lib/grading/formula.test.ts lib/grading/index.ts
git commit -m "feat(grading): acorn-sandboxed formula evaluator with chem helpers"
```

---

### Task 9: Derived variables — wire formula evaluator into materializer

**Files:**
- Modify: `lib/materializer/materialize.ts` (lift `derived` from throwing to evaluating)
- Modify: `lib/materializer/materialize.test.ts` (add derived test cases)
- Create: `lib/materializer/index.ts`

- [ ] **Step 1: Add failing derived tests**

Append to `lib/materializer/materialize.test.ts`:

```ts
describe('materialize — derived', () => {
  it('evaluates a single derived against earlier variables', () => {
    const specs: VariableSpec[] = [
      { name: 'a', type: 'randint', position: 1, spec: { min: 5, max: 5 } },
      { name: 'b', type: 'randint', position: 2, spec: { min: 7, max: 7 } },
      { name: 's', type: 'derived', position: 3, spec: { expression: 'a + b' } },
    ];
    const out = materialize(specs, 1);
    expect(out.a).toBe(5);
    expect(out.b).toBe(7);
    expect(out.s).toBe(12);
  });

  it('chains: derived can depend on another derived', () => {
    const specs: VariableSpec[] = [
      { name: 'm', type: 'randint', position: 1, spec: { min: 100, max: 100 } },
      { name: 'mm', type: 'derived', position: 2, spec: { expression: 'molar_mass("NaCl")' } },
      { name: 'moles', type: 'derived', position: 3, spec: { expression: 'm / mm' } },
    ];
    const out = materialize(specs, 1);
    expect(out.mm).toBeCloseTo(58.44, 2);
    expect(out.moles as number).toBeCloseTo(100 / 58.44, 4);
  });

  it('throws on derived referencing undefined variable', () => {
    const specs: VariableSpec[] = [
      { name: 'a', type: 'derived', position: 1, spec: { expression: 'undefined_var + 1' } },
    ];
    expect(() => materialize(specs, 1)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/materializer/materialize.test.ts`
Expected: FAIL — derived tests throw "derived variables not yet supported".

- [ ] **Step 3: Implement derived in materializer**

In `lib/materializer/materialize.ts`, add at the top:

```ts
import { evaluate } from '@/lib/grading/formula';
```

Replace the `case 'derived':` block with:

```ts
    case 'derived': {
      return evaluate(v.spec.expression, _scope);
    }
```

- [ ] **Step 4: Add barrel export**

Create `lib/materializer/index.ts`:

```ts
export { materialize } from './materialize';
export { stableSeed } from './seed';
export type { MaterializedValue, MaterializedValues, CompoundValue } from './types';
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run lib/materializer/`
Expected: PASS, ~12 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/materializer/materialize.ts lib/materializer/materialize.test.ts lib/materializer/index.ts
git commit -m "feat(materializer): support derived variables via formula evaluator"
```

---

### Task 10: Question per-type zod schemas

**Files:**
- Create: `lib/schemas/questions.ts`
- Test:   `lib/schemas/questions.test.ts`
- Create: `lib/schemas/index.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/schemas/questions.test.ts` with cases for each of the 6 types (mc, ma, tf, numeric, short_answer, fill_in) plus common rejections. Sample:

```ts
import { describe, it, expect } from 'vitest';
import { QuestionSchema } from './questions';

describe('QuestionSchema — mc', () => {
  it('accepts a valid mc', () => {
    const r = QuestionSchema.safeParse({
      type: 'mc',
      body: {
        stem: 'Which gas?',
        choices: [
          { id: 'a', label: 'O2' },
          { id: 'b', label: 'N2' },
        ],
      },
      scoring: { correct_id: 'a' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects mc with < 2 choices', () => {
    const r = QuestionSchema.safeParse({
      type: 'mc',
      body: { stem: 'x', choices: [{ id: 'a', label: 'A' }] },
      scoring: { correct_id: 'a' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects mc whose correct_id is not a choice', () => {
    const r = QuestionSchema.safeParse({
      type: 'mc',
      body: {
        stem: 'x',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
      scoring: { correct_id: 'c' },
    });
    expect(r.success).toBe(false);
  });
});

describe('QuestionSchema — numeric', () => {
  it('accepts valid numeric', () => {
    const r = QuestionSchema.safeParse({
      type: 'numeric',
      body: { stem: 'How many moles of {{c}} in {{m}} g?', units: 'mol' },
      scoring: { formula: 'm / molar_mass(c)', tolerance: 0.01 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects numeric with negative tolerance', () => {
    const r = QuestionSchema.safeParse({
      type: 'numeric',
      body: { stem: 'x' },
      scoring: { formula: '1', tolerance: -0.01 },
    });
    expect(r.success).toBe(false);
  });
});

describe('QuestionSchema — short_answer', () => {
  it('rejects invalid regex', () => {
    const r = QuestionSchema.safeParse({
      type: 'short_answer',
      body: { stem: 'x' },
      scoring: { pattern: '[unclosed', case_insensitive: false },
    });
    expect(r.success).toBe(false);
  });
});

describe('QuestionSchema — fill_in', () => {
  it('accepts valid fill_in with matching blanks', () => {
    const r = QuestionSchema.safeParse({
      type: 'fill_in',
      body: {
        stem: 'The capital of France is {{blank:capital}}.',
        blanks: [{ id: 'capital' }],
      },
      scoring: {
        targets: [{ id: 'capital', target: 'Paris', case_insensitive: true }],
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects fill_in with stem/scoring id mismatch', () => {
    const r = QuestionSchema.safeParse({
      type: 'fill_in',
      body: { stem: 'X is {{blank:a}}.', blanks: [{ id: 'a' }] },
      scoring: { targets: [{ id: 'b', target: 'Y' }] },
    });
    expect(r.success).toBe(false);
  });
});

describe('QuestionSchema — common', () => {
  it('rejects empty stem (after trim)', () => {
    const r = QuestionSchema.safeParse({
      type: 'tf',
      body: { stem: '   ' },
      scoring: { correct: true },
    });
    expect(r.success).toBe(false);
  });

  it('accepts valid tf', () => {
    const r = QuestionSchema.safeParse({
      type: 'tf',
      body: { stem: 'Water is wet.' },
      scoring: { correct: true },
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid ma', () => {
    const r = QuestionSchema.safeParse({
      type: 'ma',
      body: {
        stem: 'Pick all',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
        ],
      },
      scoring: { correct_ids: ['a', 'c'] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid short_answer pattern', () => {
    const r = QuestionSchema.safeParse({
      type: 'short_answer',
      body: { stem: 'Name a noble gas.' },
      scoring: { pattern: '^(He|Ne|Ar|Kr|Xe|Rn)$', case_insensitive: true },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/schemas/questions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement question schemas**

Create `lib/schemas/questions.ts`:

```ts
import { z } from 'zod';

const stem = z.string().refine((s) => s.trim().length > 0, {
  message: 'Stem must not be empty',
});

const choiceItem = z.object({ id: z.string().min(1), label: z.string() });

const McBody = z.object({
  stem,
  choices: z.array(choiceItem).min(2),
  shuffle: z.boolean().optional(),
});
const McScoring = z.object({
  correct_id: z.string().min(1),
  points: z.number().optional(),
});

const MaBody = McBody;
const MaScoring = z.object({
  correct_ids: z.array(z.string().min(1)).min(1),
  partial_credit: z.boolean().optional(),
  points: z.number().optional(),
});

const TfBody = z.object({ stem });
const TfScoring = z.object({ correct: z.boolean(), points: z.number().optional() });

const NumericBody = z.object({ stem, units: z.string().optional() });
const NumericScoring = z.object({
  formula: z.string().min(1),
  tolerance: z.number().min(0),
  points: z.number().optional(),
});

const ShortAnswerBody = z.object({ stem });
const ShortAnswerScoring = z
  .object({
    pattern: z.string().min(1),
    case_insensitive: z.boolean().optional(),
    points: z.number().optional(),
  })
  .refine(
    (s) => {
      try { new RegExp(s.pattern); return true; }
      catch { return false; }
    },
    { message: 'pattern must be a valid regular expression' },
  );

const FillInBody = z.object({
  stem,
  blanks: z.array(z.object({ id: z.string().min(1), prompt: z.string().optional() })),
});
const FillInScoring = z.object({
  targets: z.array(
    z.object({
      id: z.string().min(1),
      target: z.string().min(1),
      case_insensitive: z.boolean().optional(),
    }),
  ),
  points: z.number().optional(),
});

const BLANK_TOKEN = /\{\{blank:([a-zA-Z0-9_-]+)\}\}/g;

const Mc = z.object({ type: z.literal('mc'), body: McBody, scoring: McScoring }).refine(
  (q) => q.body.choices.some((c) => c.id === q.scoring.correct_id),
  { message: 'correct_id must match one of the choices', path: ['scoring', 'correct_id'] },
);

const Ma = z.object({ type: z.literal('ma'), body: MaBody, scoring: MaScoring }).refine(
  (q) => {
    const ids = new Set(q.body.choices.map((c) => c.id));
    return q.scoring.correct_ids.every((id) => ids.has(id));
  },
  { message: 'every correct id must match a choice', path: ['scoring', 'correct_ids'] },
);

const Tf = z.object({ type: z.literal('tf'), body: TfBody, scoring: TfScoring });

const Numeric = z.object({
  type: z.literal('numeric'), body: NumericBody, scoring: NumericScoring,
});

const ShortAnswer = z.object({
  type: z.literal('short_answer'),
  body: ShortAnswerBody,
  scoring: ShortAnswerScoring,
});

const FillIn = z
  .object({ type: z.literal('fill_in'), body: FillInBody, scoring: FillInScoring })
  .refine(
    (q) => {
      const stemIds = new Set<string>();
      for (const m of q.body.stem.matchAll(BLANK_TOKEN)) stemIds.add(m[1]!);
      const blankIds = new Set(q.body.blanks.map((b) => b.id));
      const scoringIds = new Set(q.scoring.targets.map((t) => t.id));
      const eq = (a: Set<string>, b: Set<string>) =>
        a.size === b.size && [...a].every((x) => b.has(x));
      return eq(stemIds, blankIds) && eq(blankIds, scoringIds);
    },
    {
      message: 'stem tokens, blanks, and scoring targets must reference the same set of ids',
      path: ['body', 'blanks'],
    },
  );

export const QuestionSchema = z.discriminatedUnion('type', [
  Mc, Ma, Tf, Numeric, ShortAnswer, FillIn,
]);

export type Question = z.infer<typeof QuestionSchema>;
export type QuestionType = Question['type'];
```

- [ ] **Step 4: Add barrel**

Create `lib/schemas/index.ts`:

```ts
export { QuestionSchema, type Question, type QuestionType } from './questions';
export { VariableSpecSchema, type VariableSpec } from './variables';
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run lib/schemas/questions.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add lib/schemas/questions.ts lib/schemas/questions.test.ts lib/schemas/index.ts
git commit -m "feat(schemas): zod schemas for 6 question types with cross-field validation"
```

---

### Task 11: {{var}} substitution

**Files:**
- Create: `lib/rendering/substitute.ts`
- Test:   `lib/rendering/substitute.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/rendering/substitute.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { substitute } from './substitute';

describe('substitute', () => {
  it('replaces a single variable', () => {
    expect(substitute('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
  });

  it('replaces multiple variables', () => {
    expect(substitute('{{a}} + {{b}}', { a: '1', b: '2' })).toBe('1 + 2');
  });

  it('substitutes numeric values', () => {
    expect(substitute('Mass: {{m}} g', { m: 42 })).toBe('Mass: 42 g');
  });

  it('substitutes compound values by label', () => {
    const c = { label: 'NaCl', smiles: '[Na+].[Cl-]' };
    expect(substitute('Dissolve {{salt}}', { salt: c })).toBe('Dissolve NaCl');
  });

  it('HTML-escapes variable values', () => {
    expect(substitute('Hi {{x}}', { x: '<script>alert(1)</script>' })).toBe(
      'Hi &lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('leaves unrecognized {{x}} alone (no var)', () => {
    expect(substitute('No {{missing}} here', {})).toBe('No {{missing}} here');
  });

  it('leaves blank tokens {{blank:id}} alone (handled later)', () => {
    expect(substitute('Fill {{blank:x}}', { blank: 'something' })).toBe(
      'Fill {{blank:x}}',
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/rendering/substitute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement substitute**

Create `lib/rendering/substitute.ts`:

```ts
import type { MaterializedValues, CompoundValue } from '@/lib/materializer/types';

const VAR = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stringify(v: unknown): string {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'label' in v) return (v as CompoundValue).label;
  return '';
}

export function substitute(template: string, values: MaterializedValues): string {
  return template.replace(VAR, (match, name) => {
    if (!(name in values)) return match;
    return htmlEscape(stringify(values[name]));
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/rendering/substitute.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/rendering/substitute.ts lib/rendering/substitute.test.ts
git commit -m "feat(rendering): {{var}} substitution with HTML escape"
```

---

### Task 12: Markdown + KaTeX render component

**Files:**
- Create: `lib/rendering/md.tsx`
- Test:   `lib/rendering/md.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `lib/rendering/md.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown } from './md';

describe('<Markdown />', () => {
  it('renders plain markdown', () => {
    const { container } = render(<Markdown source="**bold**" />);
    expect(container.innerHTML).toContain('<strong>bold</strong>');
  });

  it('renders headings', () => {
    const { container } = render(<Markdown source="# Title" />);
    expect(container.innerHTML).toMatch(/<h1[^>]*>Title<\/h1>/);
  });

  it('renders inline math via KaTeX (MathML output)', () => {
    const { container } = render(<Markdown source="$E = mc^2$" />);
    expect(container.innerHTML).toContain('katex');
    expect(container.innerHTML).toContain('<math');
  });

  it('renders display math', () => {
    const { container } = render(<Markdown source="$$\\sum_{i=0}^n i$$" />);
    expect(container.innerHTML).toContain('katex-display');
  });

  it('escapes raw HTML in the source', () => {
    const { container } = render(<Markdown source="<script>x</script>" />);
    expect(container.innerHTML).not.toContain('<script>');
  });
});
```

- [ ] **Step 2: Add testing-library to deps if missing**

`@testing-library/react` and `@testing-library/jest-dom` are already devDeps (per Plan 1). If `render` fails to import, install:
```bash
npm install -D @testing-library/react@^16 @testing-library/jest-dom@^6
```
(Skip if already installed.)

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/rendering/md.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement <Markdown />**

Create `lib/rendering/md.tsx`:

```tsx
import { Marked, type Tokens } from 'marked';
import katex from 'katex';

const marked = new Marked();

// Inline math: $ ... $ (not $$ ... $$)
marked.use({
  extensions: [
    {
      name: 'inlineMath',
      level: 'inline',
      start(src) { return src.indexOf('$'); },
      tokenizer(src) {
        const m = /^\$([^$\n]+)\$/.exec(src);
        if (m) return { type: 'inlineMath', raw: m[0], text: m[1]! };
      },
      renderer(token) {
        const t = token as Tokens.Generic;
        try {
          return katex.renderToString(t.text as string, { output: 'mathml', throwOnError: false });
        } catch {
          return `<span class="math-error">${t.text}</span>`;
        }
      },
    },
    {
      name: 'blockMath',
      level: 'block',
      start(src) { return src.indexOf('$$'); },
      tokenizer(src) {
        const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
        if (m) return { type: 'blockMath', raw: m[0], text: m[1]! };
      },
      renderer(token) {
        const t = token as Tokens.Generic;
        try {
          return katex.renderToString(t.text as string, {
            output: 'mathml',
            displayMode: true,
            throwOnError: false,
          });
        } catch {
          return `<div class="math-error">${t.text}</div>`;
        }
      },
    },
  ],
});

export function Markdown({ source }: { source: string }) {
  const html = marked.parse(source, { async: false }) as string;
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

Add to `app/globals.css` the KaTeX stylesheet import (Step 5).

- [ ] **Step 5: Import KaTeX CSS globally**

Edit `app/globals.css` — add at the top:

```css
@import 'katex/dist/katex.min.css';
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run lib/rendering/md.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/rendering/md.tsx lib/rendering/md.test.tsx app/globals.css
git commit -m "feat(rendering): Markdown component with KaTeX (MathML output for a11y)"
```

---

### Task 13: renderQuestion + types + index barrel

**Files:**
- Create: `lib/rendering/types.ts`
- Create: `lib/rendering/render.ts`
- Test:   `lib/rendering/render.test.ts`
- Create: `lib/rendering/index.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/rendering/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderQuestion } from './render';

describe('renderQuestion — mc', () => {
  it('substitutes {{var}} in stem and choice labels', () => {
    const out = renderQuestion({
      question: {
        type: 'mc',
        body: {
          stem: 'Pick the heavier: {{a}} or {{b}}?',
          choices: [
            { id: 'x', label: '{{a}}' },
            { id: 'y', label: '{{b}}' },
          ],
        },
        scoring: { correct_id: 'x' },
        variables: [
          { name: 'a', type: 'choice', position: 1, spec: { values: ['Iron'] } },
          { name: 'b', type: 'choice', position: 2, spec: { values: ['Gold'] } },
        ],
      },
      seed: 0,
    });
    expect(out.rendered_stem).toBe('Pick the heavier: Iron or Gold?');
    expect(out.rendered_body).toMatchObject({
      kind: 'mc',
      choices: [
        { id: 'x', label_substituted: 'Iron' },
        { id: 'y', label_substituted: 'Gold' },
      ],
    });
    expect(out.grading_target).toEqual({ kind: 'mc', correct_id: 'x' });
  });
});

describe('renderQuestion — numeric', () => {
  it('computes grading target by evaluating formula against materialized values', () => {
    const out = renderQuestion({
      question: {
        type: 'numeric',
        body: { stem: 'Find moles of {{c}} in {{m}} g' },
        scoring: { formula: 'm / molar_mass(c)', tolerance: 0.01 },
        variables: [
          {
            name: 'c',
            type: 'chemistry_compound',
            position: 1,
            spec: { values: [{ label: 'NaCl', smiles: '[Na+].[Cl-]' }] },
          },
          { name: 'm', type: 'randint', position: 2, spec: { min: 100, max: 100 } },
        ],
      },
      seed: 0,
    });
    expect(out.materialized_values.c).toMatchObject({ label: 'NaCl' });
    expect(out.materialized_values.m).toBe(100);
    expect(out.grading_target).toMatchObject({
      kind: 'numeric',
      value: expect.any(Number),
      tolerance: 0.01,
    });
    expect((out.grading_target as { value: number }).value).toBeCloseTo(100 / 58.44, 4);
  });
});

describe('renderQuestion — tf', () => {
  it('passes the correct boolean', () => {
    const out = renderQuestion({
      question: {
        type: 'tf',
        body: { stem: '{{x}} > 5' },
        scoring: { correct: true },
        variables: [{ name: 'x', type: 'randint', position: 1, spec: { min: 10, max: 10 } }],
      },
      seed: 0,
    });
    expect(out.rendered_stem).toBe('10 &gt; 5');
    expect(out.grading_target).toEqual({ kind: 'tf', correct: true });
  });
});

describe('renderQuestion — determinism', () => {
  it('same seed produces identical RenderOutput', () => {
    const input = {
      question: {
        type: 'mc' as const,
        body: {
          stem: '{{a}}?',
          choices: [
            { id: 'x', label: 'X' },
            { id: 'y', label: 'Y' },
          ],
        },
        scoring: { correct_id: 'x' },
        variables: [
          {
            name: 'a',
            type: 'choice' as const,
            position: 1,
            spec: { values: ['One', 'Two', 'Three'] },
          },
        ],
      },
      seed: 7,
    };
    const a = renderQuestion(input);
    const b = renderQuestion(input);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/rendering/render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types**

Create `lib/rendering/types.ts`:

```ts
import type { QuestionType } from '@/lib/schemas/questions';
import type { VariableSpec } from '@/lib/schemas/variables';
import type { MaterializedValues } from '@/lib/materializer/types';

export type RenderInput = {
  question: {
    type: QuestionType;
    body: Record<string, unknown>;
    scoring: Record<string, unknown>;
    variables: VariableSpec[];
  };
  seed: number;
};

export type RenderedBody =
  | { kind: 'mc'; choices: { id: string; label_substituted: string }[] }
  | { kind: 'ma'; choices: { id: string; label_substituted: string }[] }
  | { kind: 'tf' }
  | { kind: 'numeric'; units?: string }
  | { kind: 'short_answer' }
  | { kind: 'fill_in'; blanks: { id: string; prompt?: string }[] };

export type GradingTarget =
  | { kind: 'mc'; correct_id: string }
  | { kind: 'ma'; correct_ids: string[] }
  | { kind: 'tf'; correct: boolean }
  | { kind: 'numeric'; value: number; tolerance: number }
  | { kind: 'short_answer'; pattern: string; case_insensitive: boolean }
  | { kind: 'fill_in'; targets: { id: string; target: string; case_insensitive: boolean }[] };

export type RenderOutput = {
  materialized_values: MaterializedValues;
  rendered_stem: string;
  rendered_body: RenderedBody;
  grading_target: GradingTarget;
  validation_errors: string[];
};
```

- [ ] **Step 4: Implement renderQuestion**

Create `lib/rendering/render.ts`:

```ts
import { materialize } from '@/lib/materializer/materialize';
import { evaluate, EvalError } from '@/lib/grading/formula';
import { substitute } from './substitute';
import type { RenderInput, RenderOutput, RenderedBody, GradingTarget } from './types';

export function renderQuestion(input: RenderInput): RenderOutput {
  const errors: string[] = [];
  let materialized = {} as Awaited<ReturnType<typeof materialize>>;
  try {
    materialized = materialize(input.question.variables, input.seed);
  } catch (e) {
    errors.push(`Materializer error: ${(e as Error).message}`);
  }

  const stem = substitute(
    (input.question.body['stem'] as string) ?? '',
    materialized,
  );

  let body: RenderedBody;
  let target: GradingTarget;

  switch (input.question.type) {
    case 'mc': {
      const choices =
        (input.question.body['choices'] as { id: string; label: string }[]) ?? [];
      body = {
        kind: 'mc',
        choices: choices.map((c) => ({
          id: c.id,
          label_substituted: substitute(c.label, materialized),
        })),
      };
      target = {
        kind: 'mc',
        correct_id: (input.question.scoring['correct_id'] as string) ?? '',
      };
      break;
    }
    case 'ma': {
      const choices =
        (input.question.body['choices'] as { id: string; label: string }[]) ?? [];
      body = {
        kind: 'ma',
        choices: choices.map((c) => ({
          id: c.id,
          label_substituted: substitute(c.label, materialized),
        })),
      };
      target = {
        kind: 'ma',
        correct_ids: (input.question.scoring['correct_ids'] as string[]) ?? [],
      };
      break;
    }
    case 'tf': {
      body = { kind: 'tf' };
      target = { kind: 'tf', correct: Boolean(input.question.scoring['correct']) };
      break;
    }
    case 'numeric': {
      body = {
        kind: 'numeric',
        ...(input.question.body['units']
          ? { units: input.question.body['units'] as string }
          : {}),
      };
      const formula = (input.question.scoring['formula'] as string) ?? '';
      const tolerance = Number(input.question.scoring['tolerance'] ?? 0);
      let value = NaN;
      try {
        value = evaluate(formula, materialized);
      } catch (e) {
        const msg = e instanceof EvalError ? e.message : (e as Error).message;
        errors.push(`Formula error: ${msg}`);
      }
      target = { kind: 'numeric', value, tolerance };
      break;
    }
    case 'short_answer': {
      body = { kind: 'short_answer' };
      target = {
        kind: 'short_answer',
        pattern: (input.question.scoring['pattern'] as string) ?? '',
        case_insensitive: Boolean(input.question.scoring['case_insensitive']),
      };
      break;
    }
    case 'fill_in': {
      const blanks =
        (input.question.body['blanks'] as { id: string; prompt?: string }[]) ?? [];
      body = { kind: 'fill_in', blanks };
      const rawTargets =
        (input.question.scoring['targets'] as {
          id: string;
          target: string;
          case_insensitive?: boolean;
        }[]) ?? [];
      target = {
        kind: 'fill_in',
        targets: rawTargets.map((t) => ({
          id: t.id,
          target: substitute(t.target, materialized),
          case_insensitive: Boolean(t.case_insensitive),
        })),
      };
      break;
    }
  }

  return {
    materialized_values: materialized,
    rendered_stem: stem,
    rendered_body: body!,
    grading_target: target!,
    validation_errors: errors,
  };
}
```

- [ ] **Step 5: Add barrel export**

Create `lib/rendering/index.ts`:

```ts
export { renderQuestion } from './render';
export { substitute } from './substitute';
export { Markdown } from './md';
export type {
  RenderInput,
  RenderOutput,
  RenderedBody,
  GradingTarget,
} from './types';
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run lib/rendering/render.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Commit**

```bash
git add lib/rendering/types.ts lib/rendering/render.ts lib/rendering/render.test.ts lib/rendering/index.ts
git commit -m "feat(rendering): renderQuestion — single render pipeline for all 6 question types"
```

---

### Task 14: Single-call-site manifest test for renderQuestion

**Files:**
- Test:   `lib/rendering/render.call-site.test.ts`

This is the **invariant test** the parent spec demands (§4.4). It greps the source for `renderQuestion` import statements via `acorn` and asserts the set of importing files equals the allow-list. CI fails closed on any new caller.

- [ ] **Step 1: Write the failing test**

Create `lib/rendering/render.call-site.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as acorn from 'acorn';
import { walk } from 'estree-walker';

const ALLOWED_CALLERS = [
  // Wave 1 Plan 2: preview pane only
  'components/preview/PreviewPane.tsx',
  // Wave 1 Plan 3 will add: app/(student)/attempts/[id]/page.tsx
];

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function walkDir(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') &&
             !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.call-site.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

function importsRenderQuestion(file: string): boolean {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('renderQuestion')) return false;
  try {
    const ast = acorn.parse(src, {
      ecmaVersion: 2022,
      sourceType: 'module',
      allowImportExportEverywhere: true,
    });
    let found = false;
    walk(ast as never, {
      enter(node: { type: string; specifiers?: { imported?: { name?: string } }[] }) {
        if (node.type === 'ImportDeclaration') {
          for (const s of node.specifiers ?? []) {
            if (s.imported?.name === 'renderQuestion') found = true;
          }
        }
      },
    });
    return found;
  } catch {
    return false; // ignore unparseable files (e.g. JSX without parser plugin)
  }
}

describe('renderQuestion single-call-site invariant', () => {
  it('only allow-listed files import renderQuestion', () => {
    const callers: string[] = [];
    for (const f of walkDir(REPO_ROOT)) {
      // exclude the render module's own files (re-export through index)
      if (f.includes(path.join('lib', 'rendering'))) continue;
      if (importsRenderQuestion(f)) {
        callers.push(path.relative(REPO_ROOT, f).replace(/\\/g, '/'));
      }
    }
    callers.sort();
    expect(callers).toEqual(ALLOWED_CALLERS.slice().sort());
  });
});
```

> Note: `estree-walker` may need install: `npm install -D estree-walker`. If installing adds noise, use a hand-rolled recursive walk instead (acorn AST nodes are plain objects).

- [ ] **Step 2: Install estree-walker**

Run: `npm install -D estree-walker`

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/rendering/render.call-site.test.ts`
Expected: FAIL — `callers` is empty (PreviewPane not built yet) but `ALLOWED_CALLERS` lists it. Update the test's `ALLOWED_CALLERS` to `[]` for now; the empty allow-list passes the empty caller set.

Edit Task 14 Step 1's `ALLOWED_CALLERS` to `[]` (start empty). When Task 21 ships PreviewPane.tsx, that task's commit will also add `'components/preview/PreviewPane.tsx'` to this allow-list.

- [ ] **Step 4: Run again**

Run: `npx vitest run lib/rendering/render.call-site.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rendering/render.call-site.test.ts package.json package-lock.json
git commit -m "test(rendering): single-call-site manifest invariant for renderQuestion"
```

---

### Task 15: Instructor route group with role guard

**Files:**
- Create: `app/(instructor)/layout.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/auth/instructor-only-routes.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('instructor route gate', () => {
  test('unauthenticated user is redirected to sign-in', async ({ page }) => {
    const resp = await page.goto('/assessments');
    expect(page.url()).toContain('/sign-in');
  });

  test('authenticated student gets 404', async ({ page, context }) => {
    const student = await createTestUserClient({
      email: `student-gate+${Date.now()}@test.local`,
      password: 'test-pw-1!',
    });
    try {
      await signInBrowser(context, student);
      const resp = await page.goto('/assessments');
      expect(resp?.status()).toBe(404);
    } finally {
      await deleteTestUser(student.userId);
    }
  });

  test('authenticated instructor sees the page', async ({ page, context }) => {
    const instructor = await createTestUserClient({
      email: `instr-gate+${Date.now()}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    try {
      await signInBrowser(context, instructor);
      await page.goto('/assessments');
      // The page exists (200), even if empty
      await expect(page.getByRole('heading', { name: /assessments/i })).toBeVisible();
    } finally {
      await deleteTestUser(instructor.userId);
    }
  });
});
```

- [ ] **Step 2: Add browser-session test helper**

Create `tests/helpers/browser-session.ts`:

```ts
import type { BrowserContext } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * Set Supabase auth cookies on a Playwright BrowserContext so subsequent
 * page navigations are authenticated as the given user.
 *
 * Relies on the existing test fixture {userId, client} from createTestUserClient,
 * which has already done signInWithPassword (giving us a live session).
 */
export async function signInBrowser(
  context: BrowserContext,
  fixture: { userId: string; client: SupabaseClient<Database> },
): Promise<void> {
  const { data } = await fixture.client.auth.getSession();
  if (!data.session) throw new Error('No active session on the fixture client');

  // The @supabase/ssr cookie name pattern: sb-<host-slug>-auth-token
  // Local: 127.0.0.1 → sb-127-auth-token. Use a wildcard fallback: read all cookies
  // set by the client and reissue them on the Playwright context.
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const host = url.hostname.replace(/\./g, '-');
  const tokenName = `sb-${host}-auth-token`;
  const payload = encodeURIComponent(
    JSON.stringify([data.session.access_token, data.session.refresh_token]),
  );

  await context.addCookies([
    {
      name: tokenName,
      value: payload,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}
```

> The cookie name pattern matches @supabase/ssr's default. If the actual cookie name differs in your version, run the app once in a real browser, inspect DevTools → Application → Cookies, and adjust the `tokenName` here. The cookie value format is the JSON-encoded `[access_token, refresh_token]` tuple.

- [ ] **Step 3: Run to verify it fails**

Run: `npm run e2e -- tests/auth/instructor-only-routes.spec.ts`
Expected: FAIL — `/assessments` returns 404 for all three cases (the route group doesn't exist yet).

- [ ] **Step 4: Implement the layout with role guard**

Create `app/(instructor)/layout.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in' as Route);

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'instructor') {
    notFound();
  }

  return <>{children}</>;
}
```

- [ ] **Step 5: Run to verify it still fails (because /assessments page is not built)**

Run: `npm run e2e -- tests/auth/instructor-only-routes.spec.ts`
Expected: instructor test fails (no /assessments page yet) but student test now PASSES (404 from notFound()).

Mark this expected: Task 16 builds /assessments and the instructor case will pass then.

- [ ] **Step 6: Commit**

```bash
git add app/\(instructor\)/layout.tsx tests/auth/instructor-only-routes.spec.ts tests/helpers/browser-session.ts
git commit -m "feat(auth): (instructor) route group with role guard + browser-session test helper"
```

---

### Task 16: Assessment list page

**Files:**
- Create: `app/(instructor)/assessments/page.tsx`
- Create: `components/assessments/AssessmentCard.tsx`

- [ ] **Step 1: Implement AssessmentCard**

Create `components/assessments/AssessmentCard.tsx`:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Props = {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  assessment_type: 'quiz' | 'exam';
  questionCount: number;
  updated_at: string;
};

export function AssessmentCard(p: Props) {
  return (
    <Link href={`/assessments/${p.id}` as Route} className="block">
      <Card className="hover:bg-muted/40 transition-colors">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{p.title}</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline">{p.assessment_type}</Badge>
              <Badge variant={p.status === 'published' ? 'default' : 'secondary'}>
                {p.status}
              </Badge>
            </div>
          </div>
          <CardDescription className="font-mono text-xs">{p.slug}</CardDescription>
        </CardHeader>
        <CardFooter className="text-muted-foreground text-xs">
          {p.questionCount} question{p.questionCount === 1 ? '' : 's'} ·
          updated {new Date(p.updated_at).toLocaleDateString()}
        </CardFooter>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Implement the list page**

Create `app/(instructor)/assessments/page.tsx`:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { AssessmentCard } from '@/components/assessments/AssessmentCard';

export const dynamic = 'force-dynamic';

export default async function AssessmentsListPage() {
  const supabase = await createServerSupabaseClient();
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, title, slug, status, assessment_type, updated_at, questions(id)')
    .order('updated_at', { ascending: false });

  const rows = (assessments ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    status: a.status,
    assessment_type: a.assessment_type,
    questionCount: Array.isArray(a.questions) ? a.questions.length : 0,
    updated_at: a.updated_at,
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Assessments</h1>
        <Button asChild>
          <Link href={'/assessments/new' as Route}>+ New assessment</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">No assessments yet. Create your first one.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => <AssessmentCard key={r.id} {...r} />)}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Run E2E from Task 15 to confirm instructor case passes**

Run: `npm run e2e -- tests/auth/instructor-only-routes.spec.ts`
Expected: PASS — all 3 tests now pass (instructor sees `/assessments` heading, student gets 404, unauthenticated redirects).

- [ ] **Step 4: Commit**

```bash
git add app/\(instructor\)/assessments/page.tsx components/assessments/AssessmentCard.tsx
git commit -m "feat(authoring): assessment list page + AssessmentCard"
```

---

### Task 17: Create assessment flow (page + Server Action)

**Files:**
- Create: `app/(instructor)/assessments/new/page.tsx`
- Create: `app/(instructor)/assessments/new/actions.ts`

- [ ] **Step 1: Write failing E2E test**

Create `tests/authoring/create-assessment.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test('instructor can create an assessment', async ({ page, context }) => {
  const instr = await createTestUserClient({
    email: `instr-create+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });

  try {
    await signInBrowser(context, instr);
    await page.goto('/assessments/new');
    await page.getByLabel(/title/i).fill('Stoichiometry Practice');
    await page.getByLabel(/slug/i).fill('stoich-practice');
    await page.getByLabel(/type/i).selectOption('quiz');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/assessments\/[a-f0-9-]+$/);
    await expect(page.getByRole('heading', { name: /stoichiometry practice/i })).toBeVisible();
  } finally {
    await deleteTestUser(instr.userId);
  }
});
```

- [ ] **Step 2: Implement Server Action**

Create `app/(instructor)/assessments/new/actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  assessment_type: z.enum(['quiz', 'exam']),
  time_limit_seconds: z.number().int().positive().optional(),
  default_attempts: z.number().int().positive().default(3),
});

export async function createAssessmentAction(formData: FormData): Promise<void> {
  const raw = {
    title: String(formData.get('title') ?? '').trim(),
    slug: String(formData.get('slug') ?? '').trim().toLowerCase(),
    assessment_type: String(formData.get('assessment_type') ?? 'quiz'),
    time_limit_seconds: formData.get('time_limit_seconds')
      ? Number(formData.get('time_limit_seconds'))
      : undefined,
    default_attempts: 3,
  };

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ');
    redirect(`/assessments/new?error=${encodeURIComponent(msg)}` as Route);
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in' as Route);

  const { data, error } = await supabase
    .from('assessments')
    .insert({
      owner_user_id: user.id,
      title: parsed.data.title,
      slug: parsed.data.slug,
      assessment_type: parsed.data.assessment_type,
      ...(parsed.data.time_limit_seconds != null
        ? { time_limit_seconds: parsed.data.time_limit_seconds }
        : {}),
      default_attempts: parsed.data.default_attempts,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !data) {
    redirect(`/assessments/new?error=${encodeURIComponent(error?.message ?? 'unknown')}` as Route);
  }
  redirect(`/assessments/${data.id}` as Route);
}
```

- [ ] **Step 3: Implement the create form page**

Create `app/(instructor)/assessments/new/page.tsx`:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAssessmentAction } from './actions';

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <Link href={'/assessments' as Route} className="text-muted-foreground text-sm hover:underline">
        ← Assessments
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New assessment</h1>

      {sp.error && (
        <div role="alert" className="my-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          {sp.error}
        </div>
      )}

      <form action={createAssessmentAction} className="mt-6 flex flex-col gap-3">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={200} />

        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" required pattern="^[a-z0-9-]+$" />

        <Label htmlFor="assessment_type">Type</Label>
        <select id="assessment_type" name="assessment_type" defaultValue="quiz"
                className="border-input bg-background rounded-md border px-3 py-1 text-sm">
          <option value="quiz">Quiz</option>
          <option value="exam">Exam</option>
        </select>

        <Label htmlFor="time_limit_seconds">Time limit (seconds, exam only)</Label>
        <Input id="time_limit_seconds" name="time_limit_seconds" type="number" min={1} />

        <Button type="submit" className="mt-2">Create</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Run E2E**

Run: `npm run e2e -- tests/authoring/create-assessment.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/\(instructor\)/assessments/new/ tests/authoring/create-assessment.spec.ts
git commit -m "feat(authoring): create-assessment page + Server Action"
```

---

### Task 18: Assessment overview page (settings + question list)

**Files:**
- Create: `app/(instructor)/assessments/[id]/page.tsx`
- Create: `components/assessments/SettingsForm.tsx`
- Create: `components/assessments/QuestionsTable.tsx`
- Create: `app/(instructor)/assessments/[id]/edit-settings/actions.ts`

- [ ] **Step 1: Implement SettingsForm**

Create `components/assessments/SettingsForm.tsx`:

```tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type AssessmentRow = {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  assessment_type: 'quiz' | 'exam';
  time_limit_seconds: number | null;
  default_attempts: number;
  randomize_questions: boolean;
  randomize_choices: boolean;
  opens_at: string | null;
  closes_at: string | null;
};

export function SettingsForm({
  assessment,
  action,
}: {
  assessment: AssessmentRow;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={assessment.id} />

      <div className="flex flex-col gap-1">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={assessment.title} required />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" defaultValue={assessment.slug} required
               pattern="^[a-z0-9-]+$" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="status">Status</Label>
        <select id="status" name="status" defaultValue={assessment.status}
                className="border-input bg-background rounded-md border px-3 py-1 text-sm">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="default_attempts">Default attempts</Label>
        <Input id="default_attempts" name="default_attempts" type="number" min={1}
               defaultValue={assessment.default_attempts} />
      </div>

      {assessment.assessment_type === 'exam' && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="time_limit_seconds">Time limit (seconds)</Label>
          <Input id="time_limit_seconds" name="time_limit_seconds" type="number" min={1}
                 defaultValue={assessment.time_limit_seconds ?? undefined} />
        </div>
      )}

      <label className="flex items-center gap-2">
        <input type="checkbox" name="randomize_questions"
               defaultChecked={assessment.randomize_questions} />
        Randomize question order
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="randomize_choices"
               defaultChecked={assessment.randomize_choices} />
        Randomize choice order (mc/ma)
      </label>

      <div className="md:col-span-2">
        <Button type="submit">Save settings</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Implement QuestionsTable**

Create `components/assessments/QuestionsTable.tsx`:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type QuestionRow = {
  id: string;
  position: number;
  type: string;
  stem_preview: string;
};

export function QuestionsTable({
  assessmentId,
  questions,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  assessmentId: string;
  questions: QuestionRow[];
  onMoveUp: (formData: FormData) => Promise<void>;
  onMoveDown: (formData: FormData) => Promise<void>;
  onDelete: (formData: FormData) => Promise<void>;
}) {
  if (questions.length === 0) {
    return (
      <p className="text-muted-foreground my-4">No questions yet. Add your first one.</p>
    );
  }
  return (
    <ul className="divide-y divide-border my-4">
      {questions.map((q, i) => (
        <li key={q.id} className="flex items-center gap-3 py-2">
          <span className="text-muted-foreground w-8 text-sm">Q{q.position}</span>
          <Badge variant="outline">{q.type}</Badge>
          <Link href={`/assessments/${assessmentId}/questions/${q.id}` as Route}
                className="flex-1 truncate hover:underline">
            {q.stem_preview || <em className="text-muted-foreground">(empty stem)</em>}
          </Link>
          <form action={onMoveUp}><input type="hidden" name="qid" value={q.id} />
            <Button type="submit" variant="ghost" size="default" disabled={i === 0}
                    aria-label={`Move question ${q.position} up`}>↑</Button>
          </form>
          <form action={onMoveDown}><input type="hidden" name="qid" value={q.id} />
            <Button type="submit" variant="ghost" size="default"
                    disabled={i === questions.length - 1}
                    aria-label={`Move question ${q.position} down`}>↓</Button>
          </form>
          <form action={onDelete}><input type="hidden" name="qid" value={q.id} />
            <Button type="submit" variant="destructive" size="default"
                    aria-label={`Delete question ${q.position}`}>×</Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Implement edit-settings action**

Create `app/(instructor)/assessments/[id]/edit-settings/actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const SettingsSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(['draft', 'published', 'archived']),
  default_attempts: z.number().int().positive(),
  time_limit_seconds: z.number().int().positive().optional(),
  randomize_questions: z.boolean(),
  randomize_choices: z.boolean(),
});

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const raw = {
    id: String(formData.get('id') ?? ''),
    title: String(formData.get('title') ?? '').trim(),
    slug: String(formData.get('slug') ?? '').trim().toLowerCase(),
    status: String(formData.get('status') ?? 'draft'),
    default_attempts: Number(formData.get('default_attempts') ?? 3),
    time_limit_seconds: formData.get('time_limit_seconds')
      ? Number(formData.get('time_limit_seconds'))
      : undefined,
    randomize_questions: formData.get('randomize_questions') === 'on',
    randomize_choices: formData.get('randomize_choices') === 'on',
  };

  const parsed = SettingsSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/assessments/${raw.id}?error=${encodeURIComponent('Invalid settings')}` as Route);
  }

  const supabase = await createServerSupabaseClient();
  const { id, ...patch } = parsed.data;
  const { error } = await supabase.from('assessments').update(patch).eq('id', id);
  if (error) {
    redirect(`/assessments/${id}?error=${encodeURIComponent(error.message)}` as Route);
  }

  revalidatePath(`/assessments/${id}`);
  redirect(`/assessments/${id}` as Route);
}
```

- [ ] **Step 4: Implement the overview page**

Create `app/(instructor)/assessments/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { SettingsForm } from '@/components/assessments/SettingsForm';
import { QuestionsTable } from '@/components/assessments/QuestionsTable';
import { updateSettingsAction } from './edit-settings/actions';
import { moveQuestionUpAction, moveQuestionDownAction } from './questions/[qid]/actions-reorder';
import { deleteQuestionAction } from './questions/[qid]/actions-delete';

export const dynamic = 'force-dynamic';

export default async function AssessmentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: a } = await supabase
    .from('assessments')
    .select('*')
    .eq('id', id)
    .single();
  if (!a) notFound();

  const { data: questions } = await supabase
    .from('questions')
    .select('id, position, type, body')
    .eq('assessment_id', id)
    .order('position');

  const qrows = (questions ?? []).map((q) => ({
    id: q.id,
    position: q.position,
    type: q.type,
    stem_preview: String(
      (q.body as { stem?: string })?.stem ?? '',
    ).slice(0, 80),
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href={'/assessments' as Route} className="text-muted-foreground text-sm hover:underline">
        ← Assessments
      </Link>

      <h1 className="mt-2 text-3xl font-semibold">{a.title}</h1>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Settings</h2>
        <SettingsForm assessment={a} action={updateSettingsAction} />
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Questions</h2>
          <Button asChild>
            <Link href={`/assessments/${id}/questions/new` as Route}>+ Add question</Link>
          </Button>
        </div>
        <QuestionsTable
          assessmentId={id}
          questions={qrows}
          onMoveUp={moveQuestionUpAction}
          onMoveDown={moveQuestionDownAction}
          onDelete={deleteQuestionAction}
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

Note: `actions-reorder.ts` and `actions-delete.ts` are created in Task 29 — the imports will fail typecheck until then. The plan accepts this temporary broken state inside Plan 2 (we order the page first so the table shape is locked); typecheck passes at the end of Task 29.

To keep this commit clean, create stubs:

Create `app/(instructor)/assessments/[id]/questions/[qid]/actions-reorder.ts`:

```ts
'use server';
export async function moveQuestionUpAction(_formData: FormData): Promise<void> {
  throw new Error('Not implemented yet (Task 29)');
}
export async function moveQuestionDownAction(_formData: FormData): Promise<void> {
  throw new Error('Not implemented yet (Task 29)');
}
```

Create `app/(instructor)/assessments/[id]/questions/[qid]/actions-delete.ts`:

```ts
'use server';
export async function deleteQuestionAction(_formData: FormData): Promise<void> {
  throw new Error('Not implemented yet (Task 29)');
}
```

Then commit:

```bash
git add app/\(instructor\)/assessments/\[id\]/ components/assessments/SettingsForm.tsx components/assessments/QuestionsTable.tsx
git commit -m "feat(authoring): assessment overview page (settings + questions table) + stub reorder/delete actions"
```

---

### Task 19: Question type picker + create question action

**Files:**
- Create: `app/(instructor)/assessments/[id]/questions/new/page.tsx`
- Create: `app/(instructor)/assessments/[id]/questions/new/actions.ts`
- Create: `components/assessments/TypePicker.tsx`

- [ ] **Step 1: Implement TypePicker**

Create `components/assessments/TypePicker.tsx`:

```tsx
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const TYPES = [
  { type: 'mc', name: 'Multiple choice', desc: 'One correct choice.' },
  { type: 'ma', name: 'Multiple answer', desc: 'One or more correct choices.' },
  { type: 'tf', name: 'True / false', desc: 'Boolean answer.' },
  { type: 'numeric', name: 'Numeric (with tolerance)', desc: 'Compare to a computed value.' },
  { type: 'short_answer', name: 'Short answer (regex)', desc: 'Free text matched against a pattern.' },
  { type: 'fill_in', name: 'Fill in the blank', desc: 'Inline {{blank:id}} tokens.' },
];

export function TypePicker({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {TYPES.map((t) => (
        <form key={t.type} action={action}>
          <input type="hidden" name="type" value={t.type} />
          <button type="submit" className="text-left w-full">
            <Card className="hover:bg-muted/40 transition-colors">
              <CardHeader>
                <CardTitle>{t.name}</CardTitle>
                <CardDescription>{t.desc}</CardDescription>
              </CardHeader>
            </Card>
          </button>
        </form>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement create-question action**

Create `app/(instructor)/assessments/[id]/questions/new/actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PathSchema = z.object({
  assessmentId: z.string().uuid(),
  type: z.enum(['mc', 'ma', 'tf', 'numeric', 'short_answer', 'fill_in']),
});

// Default body/scoring shapes by type — minimal so the form has something to render
const DEFAULTS: Record<string, { body: object; scoring: object }> = {
  mc:           { body: { stem: '', choices: [{ id: 'a', label: '' }, { id: 'b', label: '' }] },
                  scoring: { correct_id: 'a' } },
  ma:           { body: { stem: '', choices: [{ id: 'a', label: '' }, { id: 'b', label: '' }] },
                  scoring: { correct_ids: [] } },
  tf:           { body: { stem: '' }, scoring: { correct: true } },
  numeric:      { body: { stem: '' }, scoring: { formula: '0', tolerance: 0 } },
  short_answer: { body: { stem: '' }, scoring: { pattern: '.*', case_insensitive: true } },
  fill_in:      { body: { stem: '', blanks: [] }, scoring: { targets: [] } },
};

export async function createQuestionAction(
  assessmentId: string,
  formData: FormData,
): Promise<void> {
  const parsed = PathSchema.safeParse({
    assessmentId,
    type: String(formData.get('type') ?? ''),
  });
  if (!parsed.success) redirect(`/assessments/${assessmentId}` as Route);

  const supabase = await createServerSupabaseClient();

  const { data: maxRow } = await supabase
    .from('questions')
    .select('position')
    .eq('assessment_id', parsed.data.assessmentId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position ?? 0) + 1;

  const defaults = DEFAULTS[parsed.data.type]!;
  const { data, error } = await supabase
    .from('questions')
    .insert({
      assessment_id: parsed.data.assessmentId,
      position: nextPos,
      type: parsed.data.type,
      body: defaults.body,
      scoring: defaults.scoring,
    })
    .select('id')
    .single();

  if (error || !data) {
    redirect(`/assessments/${assessmentId}?error=${encodeURIComponent(error?.message ?? '')}` as Route);
  }
  redirect(`/assessments/${assessmentId}/questions/${data.id}` as Route);
}
```

- [ ] **Step 3: Implement the type-picker page**

Create `app/(instructor)/assessments/[id]/questions/new/page.tsx`:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { TypePicker } from '@/components/assessments/TypePicker';
import { createQuestionAction } from './actions';

export default async function NewQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const boundAction = createQuestionAction.bind(null, id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link href={`/assessments/${id}` as Route}
            className="text-muted-foreground text-sm hover:underline">
        ← Assessment
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New question</h1>
      <p className="text-muted-foreground mb-6 mt-1 text-sm">
        Pick a type. The question type can't change later — delete + recreate if you need to switch.
      </p>
      <TypePicker action={boundAction} />
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(instructor\)/assessments/\[id\]/questions/new/ components/assessments/TypePicker.tsx
git commit -m "feat(authoring): question type picker + create-question action"
```

---

### Task 20: Split-pane editor shell (page + Stem field + ActionBar + placeholders)

**Files:**
- Create: `app/(instructor)/assessments/[id]/questions/[qid]/page.tsx`
- Create: `app/(instructor)/assessments/[id]/questions/[qid]/actions.ts` (placeholder)
- Create: `components/editor/EditorPane.tsx`
- Create: `components/editor/StemField.tsx`
- Create: `components/editor/ActionBar.tsx`
- Create: `components/preview/PreviewPane.tsx` (skeleton; full live preview in Task 27)

This task lands the route + the form skeleton + a stub preview pane that just calls `renderQuestion`. Subsequent tasks fill in scoring forms, variable specs, answer surfaces, and live wiring.

- [ ] **Step 1: Implement StemField**

Create `components/editor/StemField.tsx`:

```tsx
'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function StemField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="stem">Stem</Label>
      <Textarea
        id="stem"
        name="stem"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby="stem-hint"
      />
      <p id="stem-hint" className="text-muted-foreground text-xs">
        Markdown supported. Use <code>{'{{var}}'}</code> for variable substitution,
        <code> $...$ </code> for inline math, <code> $$...$$ </code> for display math,
        <code> {'{{blank:id}}'} </code> for fill-in blanks.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Implement ActionBar**

Create `components/editor/ActionBar.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';

export function ActionBar({
  saving,
  dirty,
  onSave,
  onSaveAndNext,
  onDiscard,
  nextDisabled,
}: {
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  onSaveAndNext: () => void;
  onDiscard: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="sticky bottom-0 -mx-2 flex items-center gap-2 border-t bg-background/95 px-2 py-2 backdrop-blur">
      <Button onClick={onSave} disabled={saving || !dirty}>Save</Button>
      <Button onClick={onSaveAndNext} disabled={saving || !dirty || nextDisabled} variant="outline">
        Save &amp; Next
      </Button>
      <Button onClick={onDiscard} disabled={saving || !dirty} variant="ghost">
        Discard changes
      </Button>
      {dirty && <span className="text-muted-foreground text-xs">Unsaved changes</span>}
    </div>
  );
}
```

- [ ] **Step 3: Implement EditorPane skeleton**

Create `components/editor/EditorPane.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StemField } from './StemField';
import { ActionBar } from './ActionBar';
import type { Question, QuestionType } from '@/lib/schemas';

export type QuestionDraft = {
  type: QuestionType;
  body: Record<string, unknown>;
  scoring: Record<string, unknown>;
  variables: { name: string; type: string; position: number; spec: Record<string, unknown> }[];
};

export function EditorPane({
  position,
  totalQuestions,
  initial,
  saving,
  onSave,
  onSaveAndNext,
  onChange,
}: {
  position: number;
  totalQuestions: number;
  initial: QuestionDraft;
  saving: boolean;
  onSave: (q: QuestionDraft) => Promise<void>;
  onSaveAndNext: (q: QuestionDraft) => Promise<void>;
  onChange: (q: QuestionDraft) => void;
}) {
  const [draft, setDraft] = useState<QuestionDraft>(initial);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    onChange(draft);
  }, [draft, onChange]);

  function patch(p: Partial<QuestionDraft>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  }

  // beforeunload warning when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-2 pb-16">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Q{position} / {totalQuestions}</span>
        <Badge variant="outline">{draft.type}</Badge>
      </div>

      <StemField
        value={String(draft.body['stem'] ?? '')}
        onChange={(stem) => patch({ body: { ...draft.body, stem } })}
      />

      <Separator />

      {/* Scoring forms come in Tasks 21-22 */}
      <p className="text-muted-foreground text-sm">Scoring form — implemented in Tasks 21-22.</p>

      <Separator />

      {/* Variables come in Tasks 23-25 */}
      <p className="text-muted-foreground text-sm">Variables — implemented in Tasks 23-25.</p>

      <ActionBar
        saving={saving}
        dirty={dirty}
        onSave={async () => { await onSave(draft); setDirty(false); }}
        onSaveAndNext={async () => { await onSaveAndNext(draft); setDirty(false); }}
        onDiscard={() => { setDraft(initial); setDirty(false); }}
        nextDisabled={position >= totalQuestions}
      />
    </div>
  );
}
```

- [ ] **Step 4: Implement PreviewPane skeleton (live wiring in Task 27)**

Create `components/preview/PreviewPane.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { renderQuestion, type RenderInput } from '@/lib/rendering';
import { Markdown } from '@/lib/rendering';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { QuestionDraft } from '@/components/editor/EditorPane';

export function PreviewPane({ draft }: { draft: QuestionDraft }) {
  const [seed, setSeed] = useState(0);

  const output = useMemo(() => {
    try {
      const input: RenderInput = {
        question: {
          type: draft.type,
          body: draft.body,
          scoring: draft.scoring,
          // The full VariableSpec[] typing is enforced on Save; preview is permissive.
          variables: draft.variables as never,
        },
        seed,
      };
      return renderQuestion(input);
    } catch (e) {
      return null;
    }
  }, [draft, seed]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-2 pb-8">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Preview as</span>
        <Select value={String(seed)} onValueChange={(v) => setSeed(Number(v))}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Author (seed=0)</SelectItem>
            <SelectItem value="1">Test student 1</SelectItem>
            <SelectItem value="2">Test student 2</SelectItem>
            <SelectItem value="3">Test student 3</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {output ? (
        <>
          <Markdown source={output.rendered_stem} />
          {/* Answer surfaces come in Task 26 */}
          <p className="text-muted-foreground text-sm">
            Answer surface — implemented in Task 26.
          </p>
          {/* Reveal panel comes in Task 25 */}
          <details className="mt-4 rounded border p-2 text-sm" open>
            <summary className="cursor-pointer font-medium">Reveal</summary>
            <pre className="mt-2 overflow-x-auto text-xs">
{JSON.stringify(
  {
    materialized_values: output.materialized_values,
    grading_target: output.grading_target,
    validation_errors: output.validation_errors,
  },
  null,
  2,
)}
            </pre>
          </details>
        </>
      ) : (
        <p className="text-destructive text-sm">Preview unavailable (invalid draft).</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update the allow-list in Task 14's manifest test**

Edit `lib/rendering/render.call-site.test.ts` — replace `const ALLOWED_CALLERS = [];` with:

```ts
const ALLOWED_CALLERS = [
  'components/preview/PreviewPane.tsx',
];
```

- [ ] **Step 6: Implement the question editor page**

Create `app/(instructor)/assessments/[id]/questions/[qid]/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { EditorPane, type QuestionDraft } from '@/components/editor/EditorPane';
import { PreviewPane } from '@/components/preview/PreviewPane';
import { saveQuestionAction } from './actions';

export default function QuestionEditorPage({
  params,
  searchParams,
}: {
  params: { id: string; qid: string };
  searchParams: { initial: string; pos: string; total: string };
}) {
  // (params/searchParams handed in by the wrapper Server Component below.
  // For simplicity here we use a Client Component receiving props from a parent RSC.)
  const router = useRouter();
  const initial: QuestionDraft = JSON.parse(searchParams.initial);
  const [saving, setSaving] = useState(false);
  const [liveDraft, setLiveDraft] = useState<QuestionDraft>(initial);

  async function doSave(draft: QuestionDraft, andNext: boolean): Promise<void> {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set('payload', JSON.stringify(draft));
      await saveQuestionAction(params.id, params.qid, fd);
      if (!andNext) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex h-svh flex-col">
      <header className="border-b px-4 py-2">
        <Link href={`/assessments/${params.id}` as Route}
              className="text-muted-foreground text-sm hover:underline">
          ← Assessment
        </Link>
      </header>
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section aria-label="Editor" className="border-r overflow-hidden">
          <EditorPane
            position={Number(searchParams.pos)}
            totalQuestions={Number(searchParams.total)}
            initial={initial}
            saving={saving}
            onChange={setLiveDraft}
            onSave={(d) => doSave(d, false)}
            onSaveAndNext={(d) => doSave(d, true)}
          />
        </section>
        <section aria-label="Preview">
          <PreviewPane draft={liveDraft} />
        </section>
      </div>
    </main>
  );
}
```

Note: Next 16 App Router requires async params; this code passes them via a parent Server Component wrapper. For Plan 2 simplicity, refactor to a Server Component shell + Client Component child in Task 27 when we wire full live preview. For now, the simplest working form: split into two files.

Adjust by extracting to a wrapper. Replace the above file with **two** files:

`app/(instructor)/assessments/[id]/questions/[qid]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { QuestionEditorClient } from './client';

export const dynamic = 'force-dynamic';

export default async function QuestionEditorPage({
  params,
}: {
  params: Promise<{ id: string; qid: string }>;
}) {
  const { id, qid } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: q } = await supabase
    .from('questions')
    .select('id, position, type, body, scoring, question_variables(name, type, position, spec)')
    .eq('id', qid)
    .single();
  if (!q) notFound();

  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_id', id);

  const initial = {
    type: q.type,
    body: q.body as Record<string, unknown>,
    scoring: q.scoring as Record<string, unknown>,
    variables: q.question_variables ?? [],
  };

  return (
    <QuestionEditorClient
      assessmentId={id}
      questionId={qid}
      position={q.position}
      totalQuestions={count ?? 1}
      initial={initial}
    />
  );
}
```

`app/(instructor)/assessments/[id]/questions/[qid]/client.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { EditorPane, type QuestionDraft } from '@/components/editor/EditorPane';
import { PreviewPane } from '@/components/preview/PreviewPane';
import { saveQuestionAction } from './actions';

export function QuestionEditorClient({
  assessmentId,
  questionId,
  position,
  totalQuestions,
  initial,
}: {
  assessmentId: string;
  questionId: string;
  position: number;
  totalQuestions: number;
  initial: QuestionDraft;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [liveDraft, setLiveDraft] = useState<QuestionDraft>(initial);

  async function doSave(draft: QuestionDraft, andNext: boolean): Promise<void> {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set('payload', JSON.stringify(draft));
      await saveQuestionAction(assessmentId, questionId, fd);
      if (!andNext) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex h-svh flex-col">
      <header className="border-b px-4 py-2">
        <Link href={`/assessments/${assessmentId}` as Route}
              className="text-muted-foreground text-sm hover:underline">
          ← Assessment
        </Link>
      </header>
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section aria-label="Editor" className="border-r overflow-hidden">
          <EditorPane
            position={position}
            totalQuestions={totalQuestions}
            initial={initial}
            saving={saving}
            onChange={setLiveDraft}
            onSave={(d) => doSave(d, false)}
            onSaveAndNext={(d) => doSave(d, true)}
          />
        </section>
        <section aria-label="Preview">
          <PreviewPane draft={liveDraft} />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Add the save-action stub**

Create `app/(instructor)/assessments/[id]/questions/[qid]/actions.ts`:

```ts
'use server';
export async function saveQuestionAction(
  _assessmentId: string,
  _questionId: string,
  _formData: FormData,
): Promise<void> {
  throw new Error('Not implemented yet (Task 28)');
}
```

- [ ] **Step 8: Verify the manifest test still passes**

Run: `npx vitest run lib/rendering/render.call-site.test.ts`
Expected: PASS — `components/preview/PreviewPane.tsx` is on the allow-list, no other importers.

- [ ] **Step 9: Commit**

```bash
git add app/\(instructor\)/assessments/\[id\]/questions/\[qid\]/ components/editor/ components/preview/ lib/rendering/render.call-site.test.ts
git commit -m "feat(authoring): split-pane editor shell (stem + action bar + skeleton preview, scoring/variables/answer surfaces stubbed)"
```

---

### Task 21: Scoring forms part 1 — mc, ma, tf

**Files:**
- Create: `components/editor/scoring-forms.tsx` (named exports `McScoringForm`, `MaScoringForm`, `TfScoringForm`; numeric/short_answer/fill_in added in Task 22)
- Modify: `components/editor/EditorPane.tsx` (replace the scoring-forms placeholder with the type-dispatched component)

- [ ] **Step 1: Implement the three scoring forms**

Create `components/editor/scoring-forms.tsx`:

```tsx
'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Choice = { id: string; label: string };

export function McScoringForm({
  body, scoring, onChange,
}: {
  body: { choices?: Choice[] };
  scoring: { correct_id?: string };
  onChange: (body: object, scoring: object) => void;
}) {
  const choices: Choice[] = body.choices ?? [];
  const correct = scoring.correct_id ?? '';

  function setChoices(next: Choice[]) {
    onChange({ ...body, choices: next }, { ...scoring });
  }
  function addChoice() {
    const id = String.fromCharCode(97 + choices.length); // a, b, c, ...
    setChoices([...choices, { id, label: '' }]);
  }
  function setLabel(id: string, label: string) {
    setChoices(choices.map((c) => (c.id === id ? { ...c, label } : c)));
  }
  function remove(id: string) {
    setChoices(choices.filter((c) => c.id !== id));
  }
  function setCorrect(id: string) {
    onChange({ ...body }, { ...scoring, correct_id: id });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Choices</Label>
      <ul className="flex flex-col gap-2">
        {choices.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input type="radio" name="mc-correct" checked={correct === c.id}
                   onChange={() => setCorrect(c.id)} aria-label={`Choice ${c.id} is correct`} />
            <span className="font-mono text-xs w-6">{c.id}</span>
            <Input value={c.label} onChange={(e) => setLabel(c.id, e.target.value)} />
            <Button type="button" variant="ghost" onClick={() => remove(c.id)} aria-label="Remove">×</Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={addChoice}>+ Add choice</Button>
    </div>
  );
}

export function MaScoringForm({
  body, scoring, onChange,
}: {
  body: { choices?: Choice[] };
  scoring: { correct_ids?: string[]; partial_credit?: boolean };
  onChange: (body: object, scoring: object) => void;
}) {
  const choices: Choice[] = body.choices ?? [];
  const correct = new Set(scoring.correct_ids ?? []);

  function toggle(id: string) {
    const next = new Set(correct);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ ...body }, { ...scoring, correct_ids: [...next] });
  }
  function addChoice() {
    const id = String.fromCharCode(97 + choices.length);
    onChange({ ...body, choices: [...choices, { id, label: '' }] }, { ...scoring });
  }
  function setLabel(id: string, label: string) {
    onChange(
      { ...body, choices: choices.map((c) => (c.id === id ? { ...c, label } : c)) },
      { ...scoring },
    );
  }
  function remove(id: string) {
    onChange(
      { ...body, choices: choices.filter((c) => c.id !== id) },
      { ...scoring, correct_ids: (scoring.correct_ids ?? []).filter((x) => x !== id) },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Choices (check all correct)</Label>
      <ul className="flex flex-col gap-2">
        {choices.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input type="checkbox" checked={correct.has(c.id)} onChange={() => toggle(c.id)}
                   aria-label={`Choice ${c.id} is correct`} />
            <span className="font-mono text-xs w-6">{c.id}</span>
            <Input value={c.label} onChange={(e) => setLabel(c.id, e.target.value)} />
            <Button type="button" variant="ghost" onClick={() => remove(c.id)} aria-label="Remove">×</Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={addChoice}>+ Add choice</Button>
      <label className="flex items-center gap-2 text-sm mt-2">
        <input type="checkbox" checked={Boolean(scoring.partial_credit)}
               onChange={(e) => onChange({ ...body }, { ...scoring, partial_credit: e.target.checked })} />
        Award partial credit
      </label>
    </div>
  );
}

export function TfScoringForm({
  scoring, onChange,
}: {
  body: object;
  scoring: { correct?: boolean };
  onChange: (body: object, scoring: object) => void;
}) {
  const correct = scoring.correct === true;
  return (
    <div className="flex flex-col gap-2">
      <Label>Correct answer</Label>
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={correct} onChange={() => onChange({}, { ...scoring, correct: true })} />
          True
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!correct} onChange={() => onChange({}, { ...scoring, correct: false })} />
          False
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire scoring forms into EditorPane**

In `components/editor/EditorPane.tsx`, replace the placeholder line:

```tsx
      <p className="text-muted-foreground text-sm">Scoring form — implemented in Tasks 21-22.</p>
```

with:

```tsx
      <Scoring type={draft.type} body={draft.body} scoring={draft.scoring}
               onChange={(body, scoring) => patch({ body: { ...draft.body, ...body }, scoring })} />
```

And add at the top of EditorPane.tsx:

```tsx
import { McScoringForm, MaScoringForm, TfScoringForm } from './scoring-forms';

function Scoring({ type, body, scoring, onChange }: {
  type: QuestionType;
  body: Record<string, unknown>;
  scoring: Record<string, unknown>;
  onChange: (body: object, scoring: object) => void;
}) {
  switch (type) {
    case 'mc': return <McScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
    case 'ma': return <MaScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
    case 'tf': return <TfScoringForm body={body} scoring={scoring as never} onChange={onChange} />;
    default: return <p className="text-muted-foreground text-sm">{type} scoring form — Task 22.</p>;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add components/editor/scoring-forms.tsx components/editor/EditorPane.tsx
git commit -m "feat(authoring): mc, ma, tf scoring forms in the editor pane"
```

---

### Task 22: Scoring forms part 2 — numeric, short_answer, fill_in

**Files:**
- Modify: `components/editor/scoring-forms.tsx` (add three more named exports)
- Modify: `components/editor/EditorPane.tsx` (extend the `Scoring` dispatcher)

- [ ] **Step 1: Add NumericScoringForm**

Append to `components/editor/scoring-forms.tsx`:

```tsx
export function NumericScoringForm({
  body, scoring, onChange,
}: {
  body: { units?: string };
  scoring: { formula?: string; tolerance?: number };
  onChange: (body: object, scoring: object) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="formula">Grading formula</Label>
        <Input id="formula" value={scoring.formula ?? ''}
               onChange={(e) => onChange({ ...body }, { ...scoring, formula: e.target.value })}
               placeholder="e.g. m / molar_mass(c)" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="tolerance">Tolerance</Label>
        <Input id="tolerance" type="number" step="any" min={0}
               value={scoring.tolerance ?? 0}
               onChange={(e) => onChange({ ...body }, { ...scoring, tolerance: Number(e.target.value) })} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="units">Units (optional)</Label>
        <Input id="units" value={body.units ?? ''}
               onChange={(e) => onChange({ ...body, units: e.target.value }, { ...scoring })} />
      </div>
    </div>
  );
}

export function ShortAnswerScoringForm({
  scoring, onChange,
}: {
  body: object;
  scoring: { pattern?: string; case_insensitive?: boolean };
  onChange: (body: object, scoring: object) => void;
}) {
  let regexError: string | null = null;
  try { new RegExp(scoring.pattern ?? ''); } catch (e) { regexError = (e as Error).message; }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="pattern">Regex pattern</Label>
      <Input id="pattern" value={scoring.pattern ?? ''}
             onChange={(e) => onChange({}, { ...scoring, pattern: e.target.value })}
             aria-invalid={regexError != null} />
      {regexError && <p role="alert" className="text-destructive text-xs">{regexError}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(scoring.case_insensitive)}
               onChange={(e) => onChange({}, { ...scoring, case_insensitive: e.target.checked })} />
        Case-insensitive
      </label>
    </div>
  );
}

export function FillInScoringForm({
  body, scoring, onChange,
}: {
  body: { stem?: string; blanks?: { id: string; prompt?: string }[] };
  scoring: { targets?: { id: string; target: string; case_insensitive?: boolean }[] };
  onChange: (body: object, scoring: object) => void;
}) {
  // Infer blank IDs from stem tokens {{blank:id}}
  const tokenIds = new Set<string>();
  const stem = body.stem ?? '';
  for (const m of stem.matchAll(/\{\{blank:([a-zA-Z0-9_-]+)\}\}/g)) tokenIds.add(m[1]!);
  const targets = scoring.targets ?? [];
  const blanks = body.blanks ?? [];

  // Sync blanks + targets with token IDs
  function sync() {
    const nextBlanks = [...tokenIds].map((id) => blanks.find((b) => b.id === id) ?? { id });
    const nextTargets = [...tokenIds].map(
      (id) => targets.find((t) => t.id === id) ?? { id, target: '', case_insensitive: false },
    );
    onChange({ ...body, blanks: nextBlanks }, { ...scoring, targets: nextTargets });
  }

  function setTarget(id: string, target: string) {
    onChange(
      { ...body },
      {
        ...scoring,
        targets: [...tokenIds].map(
          (tid) => targets.find((t) => t.id === tid) ?? { id: tid, target: '', case_insensitive: false },
        ).map((t) => (t.id === id ? { ...t, target } : t)),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Blanks (auto-detected from stem tokens)</Label>
      {tokenIds.size === 0 && (
        <p className="text-muted-foreground text-sm">
          Add <code>{'{{blank:id}}'}</code> tokens in the stem to define blanks.
        </p>
      )}
      <Button type="button" variant="outline" onClick={sync}>Sync from stem</Button>
      <ul className="flex flex-col gap-2">
        {[...tokenIds].map((id) => {
          const t = targets.find((x) => x.id === id);
          return (
            <li key={id} className="flex items-center gap-2">
              <span className="font-mono text-xs w-16">{id}</span>
              <Input value={t?.target ?? ''} placeholder="target answer"
                     onChange={(e) => setTarget(id, e.target.value)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Extend the Scoring dispatcher in EditorPane**

In `components/editor/EditorPane.tsx`, replace the `Scoring` function with:

```tsx
import {
  McScoringForm, MaScoringForm, TfScoringForm,
  NumericScoringForm, ShortAnswerScoringForm, FillInScoringForm,
} from './scoring-forms';

function Scoring({ type, body, scoring, onChange }: {
  type: QuestionType;
  body: Record<string, unknown>;
  scoring: Record<string, unknown>;
  onChange: (body: object, scoring: object) => void;
}) {
  switch (type) {
    case 'mc': return <McScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
    case 'ma': return <MaScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
    case 'tf': return <TfScoringForm body={body} scoring={scoring as never} onChange={onChange} />;
    case 'numeric': return <NumericScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
    case 'short_answer': return <ShortAnswerScoringForm body={body} scoring={scoring as never} onChange={onChange} />;
    case 'fill_in': return <FillInScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add components/editor/scoring-forms.tsx components/editor/EditorPane.tsx
git commit -m "feat(authoring): numeric, short_answer, fill_in scoring forms"
```

---

### Task 23: Variables section + scalar spec sub-forms

**Files:**
- Create: `components/editor/VariablesSection.tsx`
- Create: `components/editor/variable-specs.tsx` (exports `ChoiceSpec`, `ChemistryCompoundSpec`, `RandintSpec`, `RandfloatSpec`; `DerivedSpec` added in Task 24)
- Modify: `components/editor/EditorPane.tsx` (replace variables placeholder)

- [ ] **Step 1: Implement the 4 scalar variable spec forms**

Create `components/editor/variable-specs.tsx`:

```tsx
'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export function ChoiceSpec({ spec, onChange }: {
  spec: { values?: string[] };
  onChange: (next: object) => void;
}) {
  const text = (spec.values ?? []).join('\n');
  return (
    <div className="flex flex-col gap-1">
      <Label>Values (one per line)</Label>
      <Textarea rows={4} value={text}
                onChange={(e) => onChange({ values: e.target.value.split('\n').filter(Boolean) })} />
    </div>
  );
}

export function ChemistryCompoundSpec({ spec, onChange }: {
  spec: { values?: { label: string; smiles: string }[] };
  onChange: (next: object) => void;
}) {
  const values = spec.values ?? [];
  function set(i: number, patch: Partial<{ label: string; smiles: string }>) {
    onChange({ values: values.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });
  }
  function add() { onChange({ values: [...values, { label: '', smiles: '' }] }); }
  function remove(i: number) { onChange({ values: values.filter((_, idx) => idx !== i) }); }
  return (
    <div className="flex flex-col gap-2">
      <Label>Compounds</Label>
      <ul className="flex flex-col gap-2">
        {values.map((v, i) => (
          <li key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <Input placeholder="label (e.g. NaCl)" value={v.label}
                   onChange={(e) => set(i, { label: e.target.value })} />
            <Input placeholder="SMILES" value={v.smiles} className="font-mono"
                   onChange={(e) => set(i, { smiles: e.target.value })} />
            <Button type="button" variant="ghost" onClick={() => remove(i)}>×</Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={add}>+ Add compound</Button>
    </div>
  );
}

export function RandintSpec({ spec, onChange }: {
  spec: { min?: number; max?: number; step?: number; units?: string };
  onChange: (next: object) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <div className="flex flex-col gap-1"><Label>Min</Label>
        <Input type="number" value={spec.min ?? 0}
               onChange={(e) => onChange({ ...spec, min: Number(e.target.value) })} /></div>
      <div className="flex flex-col gap-1"><Label>Max</Label>
        <Input type="number" value={spec.max ?? 10}
               onChange={(e) => onChange({ ...spec, max: Number(e.target.value) })} /></div>
      <div className="flex flex-col gap-1"><Label>Step</Label>
        <Input type="number" min={1} value={spec.step ?? 1}
               onChange={(e) => onChange({ ...spec, step: Number(e.target.value) })} /></div>
      <div className="flex flex-col gap-1"><Label>Units</Label>
        <Input value={spec.units ?? ''}
               onChange={(e) => onChange({ ...spec, units: e.target.value })} /></div>
    </div>
  );
}

export function RandfloatSpec({ spec, onChange }: {
  spec: { min?: number; max?: number; decimals?: number; units?: string };
  onChange: (next: object) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <div className="flex flex-col gap-1"><Label>Min</Label>
        <Input type="number" step="any" value={spec.min ?? 0}
               onChange={(e) => onChange({ ...spec, min: Number(e.target.value) })} /></div>
      <div className="flex flex-col gap-1"><Label>Max</Label>
        <Input type="number" step="any" value={spec.max ?? 1}
               onChange={(e) => onChange({ ...spec, max: Number(e.target.value) })} /></div>
      <div className="flex flex-col gap-1"><Label>Decimals</Label>
        <Input type="number" min={0} max={10} value={spec.decimals ?? 2}
               onChange={(e) => onChange({ ...spec, decimals: Number(e.target.value) })} /></div>
      <div className="flex flex-col gap-1"><Label>Units</Label>
        <Input value={spec.units ?? ''}
               onChange={(e) => onChange({ ...spec, units: e.target.value })} /></div>
    </div>
  );
}
```

- [ ] **Step 2: Implement VariablesSection**

Create `components/editor/VariablesSection.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChoiceSpec, ChemistryCompoundSpec, RandintSpec, RandfloatSpec } from './variable-specs';

type V = {
  name: string;
  type: 'choice' | 'chemistry_compound' | 'randint' | 'randfloat' | 'derived';
  position: number;
  spec: Record<string, unknown>;
};

const DEFAULTS: Record<V['type'], object> = {
  choice: { values: [] },
  chemistry_compound: { values: [] },
  randint: { min: 1, max: 10 },
  randfloat: { min: 0, max: 1, decimals: 2 },
  derived: { expression: '' },
};

export function VariablesSection({
  variables, onChange,
}: {
  variables: V[];
  onChange: (next: V[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    const next = new Set(expanded);
    next.has(i) ? next.delete(i) : next.add(i);
    setExpanded(next);
  }
  function add() {
    onChange([
      ...variables,
      { name: `v${variables.length + 1}`, type: 'randint', position: variables.length + 1,
        spec: DEFAULTS.randint as Record<string, unknown> },
    ]);
  }
  function set(i: number, patch: Partial<V>) {
    onChange(variables.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function setType(i: number, type: V['type']) {
    set(i, { type, spec: DEFAULTS[type] as Record<string, unknown> });
  }
  function remove(i: number) {
    onChange(variables.filter((_, idx) => idx !== i).map((v, idx) => ({ ...v, position: idx + 1 })));
  }

  function renderSpec(v: V, i: number) {
    const onSpecChange = (next: object) => set(i, { spec: next as Record<string, unknown> });
    switch (v.type) {
      case 'choice': return <ChoiceSpec spec={v.spec as never} onChange={onSpecChange} />;
      case 'chemistry_compound':
        return <ChemistryCompoundSpec spec={v.spec as never} onChange={onSpecChange} />;
      case 'randint': return <RandintSpec spec={v.spec as never} onChange={onSpecChange} />;
      case 'randfloat': return <RandfloatSpec spec={v.spec as never} onChange={onSpecChange} />;
      case 'derived':
        return <p className="text-muted-foreground text-sm">Derived editor — Task 24.</p>;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Variables (optional — parameterization)</Label>
      <ul className="flex flex-col gap-2">
        {variables.map((v, i) => (
          <li key={i} className="rounded border p-2">
            <div className="flex items-center gap-2">
              <Input className="w-40 font-mono text-sm" value={v.name}
                     onChange={(e) => set(i, { name: e.target.value })}
                     aria-label={`Variable ${i + 1} name`} />
              <Select value={v.type} onValueChange={(t) => setType(i, t as V['type'])}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="choice">choice</SelectItem>
                  <SelectItem value="chemistry_compound">chemistry_compound</SelectItem>
                  <SelectItem value="randint">randint</SelectItem>
                  <SelectItem value="randfloat">randfloat</SelectItem>
                  <SelectItem value="derived">derived</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost"
                      onClick={() => toggle(i)}
                      aria-expanded={expanded.has(i)} aria-controls={`vspec-${i}`}>
                {expanded.has(i) ? '▴' : '▾'} Configure
              </Button>
              <Button type="button" variant="ghost" onClick={() => remove(i)} aria-label="Remove">×</Button>
            </div>
            {expanded.has(i) && (
              <div id={`vspec-${i}`} className="mt-2">{renderSpec(v, i)}</div>
            )}
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={add}>+ Add variable</Button>
    </div>
  );
}
```

- [ ] **Step 3: Wire VariablesSection into EditorPane**

In `components/editor/EditorPane.tsx`, replace the variables placeholder line with:

```tsx
      <VariablesSection
        variables={draft.variables as never}
        onChange={(variables) => patch({ variables: variables as typeof draft.variables })}
      />
```

And add at top:

```tsx
import { VariablesSection } from './VariablesSection';
```

- [ ] **Step 4: Commit**

```bash
git add components/editor/VariablesSection.tsx components/editor/variable-specs.tsx components/editor/EditorPane.tsx
git commit -m "feat(authoring): variables section + 4 scalar spec sub-forms (choice, chemistry_compound, randint, randfloat)"
```

---

### Task 24: Derived variable spec sub-form with live evaluation

**Files:**
- Modify: `components/editor/variable-specs.tsx` (add `DerivedSpec`)
- Modify: `components/editor/VariablesSection.tsx` (dispatch `derived` to `DerivedSpec`)

- [ ] **Step 1: Implement DerivedSpec**

Append to `components/editor/variable-specs.tsx`:

```tsx
import { useMemo } from 'react';
import { evaluate, EvalError } from '@/lib/grading';
import type { MaterializedValues } from '@/lib/materializer/types';

export function DerivedSpec({
  spec, scope, onChange,
}: {
  spec: { expression?: string };
  scope: MaterializedValues; // variables materialized for the current preview seed
  onChange: (next: object) => void;
}) {
  const evalResult = useMemo(() => {
    const expr = spec.expression ?? '';
    if (!expr) return { ok: false as const, msg: 'empty' };
    try {
      return { ok: true as const, value: evaluate(expr, scope) };
    } catch (e) {
      return { ok: false as const, msg: e instanceof EvalError ? e.message : (e as Error).message };
    }
  }, [spec.expression, scope]);

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="derived-expr">Expression</Label>
      <Textarea id="derived-expr" rows={2} className="font-mono text-sm"
                value={spec.expression ?? ''}
                onChange={(e) => onChange({ expression: e.target.value })} />
      {evalResult.ok ? (
        <p className="text-muted-foreground text-xs">
          evaluates to: <span className="text-foreground font-mono">{evalResult.value}</span>
        </p>
      ) : (
        <p role="alert" className="text-destructive text-xs">{evalResult.msg}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Pipe the materialized scope into VariablesSection**

The Derived spec form needs the *currently materialized values of earlier variables* to display "evaluates to: X". Materialization is already happening in `PreviewPane` via `renderQuestion`. Lift the materialized_values up so `EditorPane` can hand them to `VariablesSection`.

Modify the editor page (`client.tsx` from Task 20) — track `materialized_values` from the preview output via a callback:

In `client.tsx`, replace the body with:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { EditorPane, type QuestionDraft } from '@/components/editor/EditorPane';
import { PreviewPane } from '@/components/preview/PreviewPane';
import { saveQuestionAction } from './actions';
import { renderQuestion } from '@/lib/rendering';
import type { MaterializedValues } from '@/lib/materializer/types';

export function QuestionEditorClient({
  assessmentId, questionId, position, totalQuestions, initial,
}: {
  assessmentId: string; questionId: string; position: number; totalQuestions: number;
  initial: QuestionDraft;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [liveDraft, setLiveDraft] = useState<QuestionDraft>(initial);
  const [seed, setSeed] = useState(0);

  const materialized: MaterializedValues = useMemo(() => {
    try {
      return renderQuestion({
        question: {
          type: liveDraft.type, body: liveDraft.body, scoring: liveDraft.scoring,
          variables: liveDraft.variables as never,
        },
        seed,
      }).materialized_values;
    } catch { return {}; }
  }, [liveDraft, seed]);

  async function doSave(draft: QuestionDraft, andNext: boolean): Promise<void> {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set('payload', JSON.stringify(draft));
      await saveQuestionAction(assessmentId, questionId, fd);
      if (!andNext) router.refresh();
    } finally { setSaving(false); }
  }

  return (
    <main className="flex h-svh flex-col">
      <header className="border-b px-4 py-2">
        <Link href={`/assessments/${assessmentId}` as Route}
              className="text-muted-foreground text-sm hover:underline">← Assessment</Link>
      </header>
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section aria-label="Editor" className="border-r overflow-hidden">
          <EditorPane position={position} totalQuestions={totalQuestions} initial={initial}
                      saving={saving} onChange={setLiveDraft} materializedScope={materialized}
                      onSave={(d) => doSave(d, false)} onSaveAndNext={(d) => doSave(d, true)} />
        </section>
        <section aria-label="Preview">
          <PreviewPane draft={liveDraft} seed={seed} onSeedChange={setSeed} />
        </section>
      </div>
    </main>
  );
}
```

In `components/preview/PreviewPane.tsx`, replace internal seed state with the prop pair (`seed`, `onSeedChange`).

In `components/editor/EditorPane.tsx`, add a `materializedScope` prop and pass it through `VariablesSection`:

```tsx
// Add to props
  materializedScope: import('@/lib/materializer/types').MaterializedValues;

// And in the JSX
      <VariablesSection
        variables={draft.variables as never}
        scope={materializedScope}
        onChange={(variables) => patch({ variables: variables as typeof draft.variables })}
      />
```

In `components/editor/VariablesSection.tsx`, accept a `scope` prop and forward it to `DerivedSpec`:

```tsx
// Update VariablesSection signature
export function VariablesSection({
  variables, scope, onChange,
}: {
  variables: V[];
  scope: import('@/lib/materializer/types').MaterializedValues;
  onChange: (next: V[]) => void;
}) {
  // ...existing body, but renderSpec for 'derived' becomes:
  case 'derived':
    return <DerivedSpec spec={v.spec as never} scope={scope} onChange={onSpecChange} />;
}
```

Add the import:

```tsx
import { DerivedSpec, ChoiceSpec, ChemistryCompoundSpec, RandintSpec, RandfloatSpec } from './variable-specs';
```

- [ ] **Step 3: Commit**

```bash
git add components/editor/variable-specs.tsx components/editor/VariablesSection.tsx components/editor/EditorPane.tsx components/preview/PreviewPane.tsx app/\(instructor\)/assessments/\[id\]/questions/\[qid\]/client.tsx
git commit -m "feat(authoring): derived variable spec with live evaluation against preview seed"
```

---

### Task 25: Reveal panel + seed switcher polish

**Files:**
- Create: `components/preview/SeedSwitcher.tsx`
- Create: `components/preview/RevealPanel.tsx`
- Modify: `components/preview/PreviewPane.tsx` (use the two new components)

- [ ] **Step 1: Implement SeedSwitcher**

Create `components/preview/SeedSwitcher.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const PRESETS = [
  { value: 0, label: 'Author (seed=0)' },
  { value: 1, label: 'Test student 1' },
  { value: 2, label: 'Test student 2' },
  { value: 3, label: 'Test student 3' },
];

export function SeedSwitcher({
  seed, onSeedChange,
}: {
  seed: number;
  onSeedChange: (next: number) => void;
}) {
  const isPreset = PRESETS.some((p) => p.value === seed);
  const [custom, setCustom] = useState(isPreset ? '' : String(seed));

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">Preview as</span>
      <Select
        value={isPreset ? String(seed) : 'custom'}
        onValueChange={(v) => {
          if (v === 'custom') return;
          onSeedChange(Number(v));
        }}
      >
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
          ))}
          <SelectItem value="custom">Custom seed…</SelectItem>
        </SelectContent>
      </Select>
      {!isPreset && (
        <Input type="number" className="w-28" value={custom}
               onChange={(e) => { setCustom(e.target.value); onSeedChange(Number(e.target.value) || 0); }}
               aria-label="Custom seed" />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement RevealPanel**

Create `components/preview/RevealPanel.tsx`:

```tsx
'use client';

import type { RenderOutput } from '@/lib/rendering';

export function RevealPanel({ output }: { output: RenderOutput }) {
  return (
    <details className="mt-4 rounded border p-2 text-sm" open>
      <summary className="cursor-pointer font-medium">Reveal</summary>
      <div className="mt-2 grid gap-2">
        <div>
          <div className="text-muted-foreground text-xs">Materialized values</div>
          <pre className="overflow-x-auto text-xs">{JSON.stringify(output.materialized_values, null, 2)}</pre>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Grading target</div>
          <pre className="overflow-x-auto text-xs">{JSON.stringify(output.grading_target, null, 2)}</pre>
        </div>
        {output.validation_errors.length > 0 && (
          <div>
            <div className="text-destructive text-xs">Validation errors</div>
            <ul className="text-destructive text-xs">
              {output.validation_errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
```

- [ ] **Step 3: Use them in PreviewPane**

Refactor `components/preview/PreviewPane.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { renderQuestion, Markdown, type RenderInput } from '@/lib/rendering';
import { SeedSwitcher } from './SeedSwitcher';
import { RevealPanel } from './RevealPanel';
import type { QuestionDraft } from '@/components/editor/EditorPane';

export function PreviewPane({
  draft, seed, onSeedChange,
}: {
  draft: QuestionDraft;
  seed: number;
  onSeedChange: (next: number) => void;
}) {
  const output = useMemo(() => {
    try {
      const input: RenderInput = {
        question: {
          type: draft.type, body: draft.body, scoring: draft.scoring,
          variables: draft.variables as never,
        },
        seed,
      };
      return renderQuestion(input);
    } catch { return null; }
  }, [draft, seed]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-2 pb-8">
      <SeedSwitcher seed={seed} onSeedChange={onSeedChange} />
      {output ? (
        <>
          <Markdown source={output.rendered_stem} />
          {/* Answer surface — implemented in Task 26 */}
          <p className="text-muted-foreground text-sm">Answer surface — Task 26.</p>
          <RevealPanel output={output} />
        </>
      ) : (
        <p className="text-destructive text-sm">Preview unavailable (invalid draft).</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/preview/SeedSwitcher.tsx components/preview/RevealPanel.tsx components/preview/PreviewPane.tsx
git commit -m "feat(authoring): seed switcher with custom-seed input + structured reveal panel"
```

---

### Task 26: Answer surfaces (6 question types)

**Files:**
- Create: `components/preview/answer-surfaces.tsx`
- Modify: `components/preview/PreviewPane.tsx` (wire in the dispatcher)

The instructor can type answers in preview to dogfood the UX. **No persistence, no grading** — just echo into local state.

- [ ] **Step 1: Implement the 6 answer surfaces**

Create `components/preview/answer-surfaces.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Markdown } from '@/lib/rendering';
import { Input } from '@/components/ui/input';
import type { RenderedBody } from '@/lib/rendering';

export function AnswerSurface({ body }: { body: RenderedBody }) {
  // Local-only state, reset when the body shape changes
  const key = JSON.stringify(body);

  switch (body.kind) {
    case 'mc': return <McSurface key={key} body={body} />;
    case 'ma': return <MaSurface key={key} body={body} />;
    case 'tf': return <TfSurface key={key} />;
    case 'numeric': return <NumericSurface key={key} body={body} />;
    case 'short_answer': return <ShortAnswerSurface key={key} />;
    case 'fill_in': return <FillInSurface key={key} body={body} />;
  }
}

function McSurface({ body }: { body: Extract<RenderedBody, { kind: 'mc' }> }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">Answer</legend>
      {body.choices.map((c) => (
        <label key={c.id} className="flex items-center gap-2">
          <input type="radio" name="mc-preview" checked={picked === c.id}
                 onChange={() => setPicked(c.id)} />
          <Markdown source={c.label_substituted} />
        </label>
      ))}
    </fieldset>
  );
}

function MaSurface({ body }: { body: Extract<RenderedBody, { kind: 'ma' }> }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">Pick all that apply</legend>
      {body.choices.map((c) => (
        <label key={c.id} className="flex items-center gap-2">
          <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
          <Markdown source={c.label_substituted} />
        </label>
      ))}
    </fieldset>
  );
}

function TfSurface() {
  const [v, setV] = useState<boolean | null>(null);
  return (
    <fieldset className="flex items-center gap-4">
      <legend className="sr-only">Answer</legend>
      <label className="flex items-center gap-2">
        <input type="radio" checked={v === true} onChange={() => setV(true)} /> True
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" checked={v === false} onChange={() => setV(false)} /> False
      </label>
    </fieldset>
  );
}

function NumericSurface({ body }: { body: Extract<RenderedBody, { kind: 'numeric' }> }) {
  const [v, setV] = useState('');
  return (
    <div className="flex items-center gap-2">
      <Input type="number" step="any" value={v} onChange={(e) => setV(e.target.value)}
             className="w-40" aria-label="Numeric answer" />
      {body.units && <span className="text-muted-foreground text-sm">{body.units}</span>}
    </div>
  );
}

function ShortAnswerSurface() {
  const [v, setV] = useState('');
  return <Input value={v} onChange={(e) => setV(e.target.value)} aria-label="Short answer" />;
}

function FillInSurface({ body }: { body: Extract<RenderedBody, { kind: 'fill_in' }> }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  return (
    <div className="flex flex-col gap-2">
      {body.blanks.map((b) => (
        <label key={b.id} className="flex items-center gap-2">
          <span className="font-mono text-xs w-24">{b.id}</span>
          <Input value={vals[b.id] ?? ''}
                 onChange={(e) => setVals((p) => ({ ...p, [b.id]: e.target.value }))}
                 placeholder={b.prompt} />
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire AnswerSurface into PreviewPane**

In `components/preview/PreviewPane.tsx`, replace the placeholder line with:

```tsx
<AnswerSurface body={output.rendered_body} />
```

And add the import:

```tsx
import { AnswerSurface } from './answer-surfaces';
```

- [ ] **Step 3: Commit**

```bash
git add components/preview/answer-surfaces.tsx components/preview/PreviewPane.tsx
git commit -m "feat(authoring): answer surfaces for all 6 question types (echo-only, no persistence)"
```

---

### Task 27: Live re-render check + integration smoke

Live wiring is already in place (Task 20 + Task 24 lifted seed and live draft). This task is the *integration smoke* — a Playwright spec that confirms the preview updates as the instructor types.

**Files:**
- Create: `tests/authoring/preview-seed-switch.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/authoring/preview-seed-switch.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test('typing in editor updates preview live; seed switch re-materializes', async ({ page, context }) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `instr-live+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });
  let aid: string;
  let qid: string;
  try {
    const { data: a } = await admin
      .from('assessments')
      .insert({ owner_user_id: instr.userId, title: 'Live', slug: 'live-test', status: 'draft' })
      .select('id').single();
    aid = a!.id;
    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: aid, position: 1, type: 'numeric',
        body: { stem: 'How many g of {{x}}?', units: 'g' },
        scoring: { formula: 'x * 2', tolerance: 0.01 },
      })
      .select('id').single();
    qid = q!.id;
    await admin.from('question_variables').insert({
      question_id: qid, name: 'x', type: 'randint', position: 1,
      spec: { min: 1, max: 100 },
    });

    await signInBrowser(context, instr);
    await page.goto(`/assessments/${aid}/questions/${qid}`);

    // Preview should already render the seeded stem
    const preview = page.getByLabel('Preview');
    await expect(preview).toContainText('How many g of');

    // Switch to a different seed; reveal panel changes
    await page.getByLabel(/Preview as/i).click();
    await page.getByRole('option', { name: /Test student 2/i }).click();
    // Reveal panel should still show a number — exact value depends on the seed
    await expect(preview).toContainText(/Materialized values/i);
  } finally {
    await deleteTestUser(instr.userId);
  }
});
```

- [ ] **Step 2: Run**

Run: `npm run e2e -- tests/authoring/preview-seed-switch.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/authoring/preview-seed-switch.spec.ts
git commit -m "test(authoring): live preview re-renders on edit + seed switch"
```

---

### Task 28: Save action with full validation

**Files:**
- Modify: `app/(instructor)/assessments/[id]/questions/[qid]/actions.ts`
- Create: `tests/authoring/validation-blocks-save.spec.ts`
- Create: `tests/authoring/edit-numeric-question.spec.ts`

- [ ] **Step 1: Implement saveQuestionAction**

Replace `app/(instructor)/assessments/[id]/questions/[qid]/actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { QuestionSchema, VariableSpecSchema } from '@/lib/schemas';
import { evaluate } from '@/lib/grading';

type SaveResult = { ok: true } | { ok: false; errors: string[] };

const PayloadSchema = z.object({
  type: z.enum(['mc', 'ma', 'tf', 'numeric', 'short_answer', 'fill_in']),
  body: z.record(z.string(), z.unknown()),
  scoring: z.record(z.string(), z.unknown()),
  variables: z.array(z.unknown()),
});

export async function saveQuestionAction(
  assessmentId: string,
  questionId: string,
  formData: FormData,
): Promise<SaveResult> {
  const rawPayload = String(formData.get('payload') ?? '');
  let parsed;
  try { parsed = PayloadSchema.parse(JSON.parse(rawPayload)); }
  catch (e) { return { ok: false, errors: [(e as Error).message] }; }

  // Validate the question itself
  const qResult = QuestionSchema.safeParse({
    type: parsed.type, body: parsed.body, scoring: parsed.scoring,
  });
  if (!qResult.success) {
    return { ok: false, errors: qResult.error.issues.map((i) => i.message) };
  }

  // Validate each variable spec
  const varResults = parsed.variables.map((v) => VariableSpecSchema.safeParse(v));
  if (varResults.some((r) => !r.success)) {
    const msgs = varResults.flatMap((r) =>
      r.success ? [] : r.error.issues.map((i) => i.message),
    );
    return { ok: false, errors: msgs };
  }
  const variables = varResults.map((r) => r.data!);

  // Variable-name uniqueness
  const names = new Set<string>();
  for (const v of variables) {
    if (names.has(v.name)) return { ok: false, errors: [`duplicate variable: ${v.name}`] };
    names.add(v.name);
  }

  // For numeric: server-side formula parse against a fake scope of zeros
  if (parsed.type === 'numeric') {
    const formula = String((parsed.scoring as { formula?: string }).formula ?? '');
    const fakeScope: Record<string, number> = {};
    for (const v of variables) fakeScope[v.name] = 0;
    try { evaluate(formula, fakeScope); }
    catch (e) { return { ok: false, errors: [`formula error: ${(e as Error).message}`] }; }
  }

  // Persist
  const supabase = await createServerSupabaseClient();
  const { error: qErr } = await supabase
    .from('questions')
    .update({ body: parsed.body, scoring: parsed.scoring })
    .eq('id', questionId);
  if (qErr) return { ok: false, errors: [qErr.message] };

  await supabase.from('question_variables').delete().eq('question_id', questionId);
  if (variables.length > 0) {
    const { error: vErr } = await supabase.from('question_variables').insert(
      variables.map((v) => ({
        question_id: questionId,
        name: v.name, type: v.type, position: v.position,
        spec: v.spec as object,
      })),
    );
    if (vErr) return { ok: false, errors: [vErr.message] };
  }

  revalidatePath(`/assessments/${assessmentId}/questions/${questionId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Surface server errors in the editor client**

Modify `app/(instructor)/assessments/[id]/questions/[qid]/client.tsx` — update `doSave` to handle the structured result:

```tsx
const [errors, setErrors] = useState<string[]>([]);

async function doSave(draft: QuestionDraft, andNext: boolean): Promise<void> {
  setSaving(true);
  setErrors([]);
  try {
    const fd = new FormData();
    fd.set('payload', JSON.stringify(draft));
    const result = await saveQuestionAction(assessmentId, questionId, fd);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (!andNext) router.refresh();
  } finally { setSaving(false); }
}
```

Display the errors above the editor:

```tsx
{errors.length > 0 && (
  <div role="alert" className="mx-2 my-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
    <ul>{errors.map((e, i) => <li key={i}>• {e}</li>)}</ul>
  </div>
)}
```

- [ ] **Step 3: Write the failing happy-path E2E**

Create `tests/authoring/edit-numeric-question.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test('instructor authors a parameterized numeric question end-to-end', async ({ page, context }) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `instr-num+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });
  try {
    const { data: a } = await admin
      .from('assessments')
      .insert({ owner_user_id: instr.userId, title: 'Stoich', slug: 'stoich', status: 'draft' })
      .select('id').single();
    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: a!.id, position: 1, type: 'numeric',
        body: { stem: '' }, scoring: { formula: '0', tolerance: 0 },
      })
      .select('id').single();

    await signInBrowser(context, instr);
    await page.goto(`/assessments/${a!.id}/questions/${q!.id}`);

    // Type a stem + a randint variable + a formula
    await page.getByLabel(/stem/i).fill('How many g of NaCl for {{moles}} mol?');
    await page.getByRole('button', { name: /\+ Add variable/i }).click();
    await page.getByLabel(/Variable 1 name/i).fill('moles');
    // Variable defaults to randint; expand and set min=1 max=5
    await page.getByRole('button', { name: /Configure/i }).click();
    await page.getByLabel(/Min/i).first().fill('1');
    await page.getByLabel(/Max/i).first().fill('5');
    // Set formula
    await page.getByLabel(/Grading formula/i).fill('moles * 58.44');
    await page.getByLabel(/Tolerance/i).fill('0.05');

    // Save
    await page.getByRole('button', { name: /^Save$/i }).click();

    // Reload and verify persisted
    await page.reload();
    await expect(page.getByLabel(/stem/i)).toHaveValue(/How many g of NaCl/);
    await expect(page.getByLabel(/Grading formula/i)).toHaveValue('moles * 58.44');
  } finally {
    await deleteTestUser(instr.userId);
  }
});
```

- [ ] **Step 4: Write the failing validation E2E**

Create `tests/authoring/validation-blocks-save.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test('invalid form blocks save with field-level error', async ({ page, context }) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `instr-val+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });
  try {
    const { data: a } = await admin
      .from('assessments')
      .insert({ owner_user_id: instr.userId, title: 'V', slug: 'val', status: 'draft' })
      .select('id').single();
    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: a!.id, position: 1, type: 'numeric',
        body: { stem: 'x' }, scoring: { formula: '0', tolerance: 0 },
      })
      .select('id').single();

    await signInBrowser(context, instr);
    await page.goto(`/assessments/${a!.id}/questions/${q!.id}`);

    // Set tolerance negative
    await page.getByLabel(/Tolerance/i).fill('-1');
    await page.getByRole('button', { name: /^Save$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/tolerance/i);
  } finally {
    await deleteTestUser(instr.userId);
  }
});
```

- [ ] **Step 5: Run all three new E2E specs**

Run: `npm run e2e -- tests/authoring/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/\(instructor\)/assessments/\[id\]/questions/\[qid\]/actions.ts app/\(instructor\)/assessments/\[id\]/questions/\[qid\]/client.tsx tests/authoring/edit-numeric-question.spec.ts tests/authoring/validation-blocks-save.spec.ts
git commit -m "feat(authoring): saveQuestionAction with full zod validation + E2E happy path + E2E validation block"
```

---

### Task 29: Reorder + delete question actions

**Files:**
- Modify: `app/(instructor)/assessments/[id]/questions/[qid]/actions-reorder.ts`
- Modify: `app/(instructor)/assessments/[id]/questions/[qid]/actions-delete.ts`

- [ ] **Step 1: Implement reorder**

Replace `actions-reorder.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const Schema = z.object({ qid: z.string().uuid() });

async function moveBy(qid: string, direction: -1 | 1): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { data: cur } = await supabase
    .from('questions')
    .select('id, assessment_id, position')
    .eq('id', qid)
    .single();
  if (!cur) return;

  const targetPos = cur.position + direction;
  const { data: neighbor } = await supabase
    .from('questions')
    .select('id, position')
    .eq('assessment_id', cur.assessment_id)
    .eq('position', targetPos)
    .maybeSingle();
  if (!neighbor) return;

  // Two-step swap to avoid UNIQUE(assessment_id, position) collision:
  // 1) park neighbor at -1
  await supabase.from('questions').update({ position: -1 }).eq('id', neighbor.id);
  // 2) move current into neighbor's slot
  await supabase.from('questions').update({ position: targetPos }).eq('id', qid);
  // 3) finalize neighbor into current's old slot
  await supabase.from('questions').update({ position: cur.position }).eq('id', neighbor.id);

  revalidatePath(`/assessments/${cur.assessment_id}`);
}

export async function moveQuestionUpAction(formData: FormData): Promise<void> {
  const { qid } = Schema.parse({ qid: String(formData.get('qid') ?? '') });
  await moveBy(qid, -1);
}

export async function moveQuestionDownAction(formData: FormData): Promise<void> {
  const { qid } = Schema.parse({ qid: String(formData.get('qid') ?? '') });
  await moveBy(qid, +1);
}
```

> The parking-slot pattern (`position = -1`) sidesteps `UNIQUE(assessment_id, position)`. The trade-off: three writes per swap inside a Server Action. If you want atomicity, wrap in a Supabase RPC or move to a Postgres function later — but this is fine for Plan 2's scale (≤50 questions per assessment).

- [ ] **Step 2: Implement delete**

Replace `actions-delete.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const Schema = z.object({ qid: z.string().uuid() });

export async function deleteQuestionAction(formData: FormData): Promise<void> {
  const { qid } = Schema.parse({ qid: String(formData.get('qid') ?? '') });
  const supabase = await createServerSupabaseClient();

  const { data: cur } = await supabase
    .from('questions')
    .select('id, assessment_id, position')
    .eq('id', qid)
    .single();
  if (!cur) return;

  await supabase.from('questions').delete().eq('id', qid);

  // Compact positions after the deletion
  const { data: rest } = await supabase
    .from('questions')
    .select('id, position')
    .eq('assessment_id', cur.assessment_id)
    .gt('position', cur.position)
    .order('position');

  for (const r of rest ?? []) {
    await supabase.from('questions').update({ position: r.position - 1 }).eq('id', r.id);
  }
  revalidatePath(`/assessments/${cur.assessment_id}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(instructor\)/assessments/\[id\]/questions/\[qid\]/actions-reorder.ts app/\(instructor\)/assessments/\[id\]/questions/\[qid\]/actions-delete.ts
git commit -m "feat(authoring): reorder (swap-adjacent) + delete question Server Actions"
```

---

### Task 30: Update home page with /assessments link for instructors

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Patch the home page**

Replace `app/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in' as Route);

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">BodhiLite</h1>
      <p className="text-muted-foreground mt-2">Signed in as {user.email}.</p>

      {profile?.role === 'instructor' && (
        <p className="mt-6">
          <Link href={'/assessments' as Route} className="underline">Go to your assessments →</Link>
        </p>
      )}

      <form action="/sign-out" method="post" className="mt-6">
        <button type="submit" className="hover:bg-muted rounded border px-3 py-1.5 text-sm">
          Sign out
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify Plan 1's sign-in flow still works**

Run: `npm run e2e -- tests/auth/sign-in.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): link instructors to /assessments"
```

---

### Task 31: Playwright RLS tests for assessments + questions + question_variables

**Files:**
- Create: `tests/rls/assessments-isolation.spec.ts`
- Create: `tests/rls/questions-isolation.spec.ts`
- Create: `tests/rls/question-variables-isolation.spec.ts`

The Plan 1 RLS policies (migration `0010`, plus the SECURITY DEFINER helpers in `0011`/`0012`) cover these tables. These tests prove the policies hold under realistic write workloads from Plan 2's new code paths.

- [ ] **Step 1: Write assessments-isolation**

Create `tests/rls/assessments-isolation.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe('RLS: instructor cannot reach another instructor\'s assessments', () => {
  let aId: string;
  let bId: string;
  let aAssessmentId: string;

  test.beforeAll(async () => {
    const admin = adminClient();
    const a = await createTestUserClient({
      email: `instrA+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
    });
    const b = await createTestUserClient({
      email: `instrB+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
    });
    aId = a.userId;
    bId = b.userId;
    const { data } = await admin.from('assessments').insert({
      owner_user_id: aId, title: 'A only', slug: `a-only-${Date.now()}`, status: 'draft',
    }).select('id').single();
    aAssessmentId = data!.id;
  });

  test.afterAll(async () => {
    await deleteTestUser(aId);
    await deleteTestUser(bId);
  });

  test('instructor B SELECTs ⇒ empty', async () => {
    const { client } = await createTestUserClient({
      email: `instrB-read+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
    });
    const { data } = await client.from('assessments').select('*').eq('id', aAssessmentId);
    expect(data).toEqual([]);
  });

  test('instructor B UPDATE ⇒ rejected (affects 0 rows under RLS)', async () => {
    const { client } = await createTestUserClient({
      email: `instrB-upd+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
    });
    const { data, error } = await client
      .from('assessments').update({ title: 'hijacked' }).eq('id', aAssessmentId).select();
    if (error) return; // RLS may also surface as an error
    expect(data).toEqual([]);
  });

  test('instructor B DELETE ⇒ rejected (affects 0 rows)', async () => {
    const { client } = await createTestUserClient({
      email: `instrB-del+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
    });
    const { data } = await client.from('assessments').delete().eq('id', aAssessmentId).select();
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: Write questions-isolation**

Create `tests/rls/questions-isolation.spec.ts` — same pattern, but seed a question into A's assessment and test B's reads/writes against it. Adapt from Step 1 by adding:

```ts
const { data: q } = await admin.from('questions').insert({
  assessment_id: aAssessmentId, position: 1, type: 'tf',
  body: { stem: 'x' }, scoring: { correct: true },
}).select('id').single();
// then SELECT/UPDATE/DELETE attempts by B target q.id
```

Full spec (use the same beforeAll/afterAll skeleton, replace `assessments` table references with `questions`, and assert empty results for B).

- [ ] **Step 3: Write question-variables-isolation**

Create `tests/rls/question-variables-isolation.spec.ts` — same pattern again, seeding a variable into A's question.

- [ ] **Step 4: Run**

Run: `npm run e2e -- tests/rls/`
Expected: PASS (Plan 1's `students-isolation.spec.ts` and the three new specs).

- [ ] **Step 5: Commit**

```bash
git add tests/rls/assessments-isolation.spec.ts tests/rls/questions-isolation.spec.ts tests/rls/question-variables-isolation.spec.ts
git commit -m "test(rls): cross-instructor isolation for assessments, questions, question_variables"
```

---

### Task 32: axe-core a11y tests for new routes

**Files:**
- Create: `tests/a11y/assessments-list.spec.ts`
- Create: `tests/a11y/assessment-new.spec.ts`
- Create: `tests/a11y/assessment-edit.spec.ts`
- Create: `tests/a11y/question-editor.spec.ts`

Each spec follows the Plan 1 pattern in `tests/a11y/sign-in.spec.ts`: navigate, run `assertNoSeriousAxeViolations(page, ctx)`. Build fails on serious/critical violations.

- [ ] **Step 1: Write all four specs**

Create `tests/a11y/assessments-list.spec.ts`:

```ts
import { test } from '@playwright/test';
import { createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';
import { assertNoSeriousAxeViolations } from '../helpers/axe';

test('assessments list has no serious axe violations', async ({ page, context }) => {
  const instr = await createTestUserClient({
    email: `a11y-list+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
  });
  try {
    await signInBrowser(context, instr);
    await page.goto('/assessments');
    await assertNoSeriousAxeViolations(page, '/assessments');
  } finally {
    await deleteTestUser(instr.userId);
  }
});
```

Create `tests/a11y/assessment-new.spec.ts`:

```ts
import { test } from '@playwright/test';
import { createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';
import { assertNoSeriousAxeViolations } from '../helpers/axe';

test('assessment/new has no serious axe violations', async ({ page, context }) => {
  const instr = await createTestUserClient({
    email: `a11y-new+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
  });
  try {
    await signInBrowser(context, instr);
    await page.goto('/assessments/new');
    await assertNoSeriousAxeViolations(page, '/assessments/new');
  } finally {
    await deleteTestUser(instr.userId);
  }
});
```

Create `tests/a11y/assessment-edit.spec.ts`:

```ts
import { test } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';
import { assertNoSeriousAxeViolations } from '../helpers/axe';

test('assessment overview has no serious axe violations', async ({ page, context }) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `a11y-edit+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
  });
  try {
    const { data } = await admin.from('assessments').insert({
      owner_user_id: instr.userId, title: 'A11y', slug: `a11y-${Date.now()}`, status: 'draft',
    }).select('id').single();
    await signInBrowser(context, instr);
    await page.goto(`/assessments/${data!.id}`);
    await assertNoSeriousAxeViolations(page, '/assessments/[id]');
  } finally {
    await deleteTestUser(instr.userId);
  }
});
```

Create `tests/a11y/question-editor.spec.ts`:

```ts
import { test } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';
import { assertNoSeriousAxeViolations } from '../helpers/axe';

test('question editor has no serious axe violations', async ({ page, context }) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `a11y-qedit+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
  });
  try {
    const { data: a } = await admin.from('assessments').insert({
      owner_user_id: instr.userId, title: 'Q', slug: `q-${Date.now()}`, status: 'draft',
    }).select('id').single();
    const { data: q } = await admin.from('questions').insert({
      assessment_id: a!.id, position: 1, type: 'numeric',
      body: { stem: 'How many g of {{x}}?' }, scoring: { formula: 'x * 2', tolerance: 0.01 },
    }).select('id').single();
    await admin.from('question_variables').insert({
      question_id: q!.id, name: 'x', type: 'randint', position: 1, spec: { min: 1, max: 10 },
    });
    await signInBrowser(context, instr);
    await page.goto(`/assessments/${a!.id}/questions/${q!.id}`);
    await assertNoSeriousAxeViolations(page, '/assessments/[id]/questions/[qid]');
  } finally {
    await deleteTestUser(instr.userId);
  }
});
```

- [ ] **Step 2: Run**

Run: `npm run e2e -- tests/a11y/`
Expected: PASS — all sign-in + 4 new axe specs clean.

- [ ] **Step 3: Iterate on any violations**

If axe surfaces a `serious` or `critical` violation, fix it in the affected component (label associations, ARIA roles, color contrast) and re-run before committing. Common offenders in this plan:

- Variable spec form rows: ensure every `<input>` has an associated `<label>` or `aria-label`.
- Up/down/× icon buttons: the `aria-label` props in Task 18's `QuestionsTable` are required, not optional.
- The seed switcher and `Configure` toggle: ensure `aria-expanded` is set on toggles (already in Task 23).

- [ ] **Step 4: Commit**

```bash
git add tests/a11y/assessments-list.spec.ts tests/a11y/assessment-new.spec.ts tests/a11y/assessment-edit.spec.ts tests/a11y/question-editor.spec.ts
git commit -m "test(a11y): axe-core coverage for assessments list, new, edit, question editor"
```

---

### Task 33: Append Plan 2 critical path to NVDA runbook

**Files:**
- Modify: `docs/runbooks/nvda-test-script.md`

- [ ] **Step 1: Read the existing runbook**

Run: `cat docs/runbooks/nvda-test-script.md` (or open in editor).

- [ ] **Step 2: Append a "Plan 2 — Authoring critical path" section**

Add at the end of `docs/runbooks/nvda-test-script.md`:

```markdown
## Plan 2 — Authoring critical path (added 2026-05-xx)

Before merging Plan 2 to `main`, run this script with NVDA on Windows. Target time: ~20 minutes. If any step fails, fix in code (not the runbook) and re-run.

1. **Sign in as the instructor.** Magic link → land on home. NVDA announces "BodhiLite" heading + "Signed in as &lt;email&gt;" + "Go to your assessments →" link.
2. **Open the assessments list.** Tab to the link, Enter. NVDA reads the page heading "Assessments" + "+ New assessment" button.
3. **Create an assessment.** Activate "+ New assessment". Tab through title, slug, type, time-limit. Every input must announce its label. Submit. NVDA announces navigation to the new assessment's overview page.
4. **Edit settings.** Tab into the Settings form. Change the title. Tab to "Save settings". Confirm a screen-reader-perceivable confirmation (page re-renders with updated title).
5. **Add a question.** Activate "+ Add question". NVDA reads "New question" heading + 6 cards. Tab through; activate "Numeric (with tolerance)".
6. **Author the question.** In the editor, type a stem with a variable token (`{{m}}`). Tab to the variables section, activate "+ Add variable", set name to `m`, type to `randint`, expand "Configure", set min=10 / max=100. Tab to the formula field, type `m / 58.44`. Tab to tolerance, type 0.01.
7. **Verify preview is keyboard-accessible.** Use Tab/Shift+Tab to navigate to the preview pane's seed switcher. Activate it (Enter), pick "Test student 2" with arrow keys + Enter. Confirm the materialized values in the Reveal panel change.
8. **Save.** Tab to "Save", activate. No errors. Reload the page; the values persist.
9. **Reorder.** Back on the assessment overview, use Tab to reach the ↑ / ↓ buttons. Confirm the order changes and that the "disabled" state on the topmost ↑ / bottom-most ↓ is announced.
10. **Delete.** Activate the × button on a question. Confirm the question is removed and other positions compact.

**Pass criteria:** every interactive element is reachable and labeled; no NVDA "unlabeled button"/"unlabeled edit field" announcements; the preview pane and form remain readable when zoomed to 200%.
```

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/nvda-test-script.md
git commit -m "docs(runbook): NVDA critical path for Plan 2 authoring surface"
```

---

### Task 34: Plan 2 success-criteria smoke + PR open

**Files:**
- None new — this task runs the success-criteria checks from spec §10 and opens the PR.

- [ ] **Step 1: Run the full local test suite**

Run:
```bash
npm run lint
npm run typecheck
npm run format:check
npm test
npm run e2e
```

All five must PASS. If any fails, fix root-cause and amend the relevant task's commit (never commit a workaround).

- [ ] **Step 2: Run the success-criteria walkthrough (per spec §10)**

Open `npm run dev`, then in a browser as the instructor:
1. Create a new quiz.
2. Author a numeric question with one `randint` variable (mass: 10–100, step 5) and one `derived` variable (`moles = mass / molar_mass("NaCl")`).
3. Set the grading formula `moles` with tolerance `0.01`.
4. Switch preview seed across three values (0, 1, 2) and confirm materialized values and grading targets re-compute live.
5. Save. Reload. Confirm persistence.
6. Open DevTools console — must be clean. Open the axe DevTools extension on the editor page — must show 0 serious/critical violations.

Time the whole walkthrough; spec §10.1 requires under 5 minutes. If it takes longer, identify the friction (slow live re-render, confusing field, etc.) and decide whether to fix in Plan 2 or punt to a polish plan.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin wave-1-plan2-authoring
gh pr create --title "Wave 1 Plan 2: Authoring" --body "$(cat <<'EOF'
## Summary

Implements the instructor authoring surface for Wave 1: assessment CRUD, six standard objective question editors, parameterization (5 variable types incl. derived via a sandboxed TS formula evaluator), and an interactive split-pane preview with a deterministic renderer.

No student-facing routes, no persistence of attempts, no auto-grading — those land in Plan 3.

Design spec: `docs/superpowers/specs/2026-05-18-bodhilite-wave1-plan2-authoring-design.md`
Implementation plan: `docs/superpowers/plans/2026-05-18-bodhilite-wave1-plan2-authoring.md`

## Test plan

- [x] `npm run lint` clean
- [x] `npm run typecheck` clean
- [x] `npm run format:check` clean
- [x] `npm test` (Vitest): all unit + invariant + schema tests pass
- [x] `npm run e2e` (Playwright): auth + authoring + a11y + RLS suites pass
- [x] Manual NVDA pass against `docs/runbooks/nvda-test-script.md` Plan 2 section
- [x] Success-criteria walkthrough (spec §10.1) completed in under 5 min, no console / axe violations
EOF
)"
```

- [ ] **Step 4: Mark PR ready for review**

```bash
gh pr ready
```

- [ ] **Step 5: Wait for CI**

Both `CI` and `E2E` workflows must go green on the PR. If E2E flakes on a network-related timeout, retry the workflow; if it fails on a real issue, fix and force-update.

- [ ] **Step 6: Squash-merge after review (manual user step)**

Once CI is green and any review feedback is addressed, the user merges via the GitHub UI (squash merge to preserve clean per-phase history on main, matching Plan 1's convention).

---

## Self-review

**Spec coverage check** (run after Task 34 completes; do not skip):

| Spec section | Covered by task(s) |
|---|---|
| §1 D1–D9 decisions | Embedded throughout; D6 split pane = Task 20; D7 type-locked = Task 19's create action |
| §2 routes & nav | Tasks 15–20 |
| §3 editor + preview structure | Tasks 20–26 |
| §4 assessment overview page | Task 18 |
| §5.1 per-type schemas | Task 10 |
| §5.1.1 validation rules beyond shape | Task 10 (regex check, fill_in id-set equality, numeric tolerance ≥ 0, choice min-count) |
| §5.2 variable schema | Task 5 |
| §5.3 Server Action contract | Tasks 17, 18, 19, 28, 29 |
| §6 rendering pipeline | Tasks 11, 12, 13 + manifest Task 14 |
| §6.4 stableSeed | Task 4 |
| §6.5 formula evaluator surface | Task 8 |
| §6.6 substitution × MD × KaTeX order | Tasks 11 (substitute first) + 12 (MD second) |
| §7 data flow | Tasks 20, 24, 28 |
| §8 library additions | Tasks 1, 2 |
| §9 testing strategy | Tasks 14, 27, 28, 31, 32, 33 |
| §10 success criteria | Task 34 |
| §11 out-of-scope | Honored — no student routes, no Storage, no Python, no DnD |

**Placeholder scan:** None of the steps say "TBD" / "implement later" / "similar to". Every step shows the actual code or command.

**Type consistency:** `QuestionDraft` shape is consistent across `EditorPane`, `client.tsx`, `PreviewPane`. `renderQuestion`/`RenderInput`/`RenderOutput` types are imported from `lib/rendering/types.ts` everywhere. `materialize` signature is stable. `saveQuestionAction` signature is `(assessmentId, questionId, formData) => Promise<SaveResult>` and clients call it as such.

**One known incidental coupling:** Task 18 creates `actions-reorder.ts` and `actions-delete.ts` as stubs (so the page imports compile), then Task 29 fills them in. The stubs throw if hit between Task 18 and Task 29, but the UI only wires them at the table — they never trigger in the intervening commits unless the user manually clicks ↑/↓/× before Task 29 lands.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-bodhilite-wave1-plan2-authoring.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for keeping the main context window clean during a 34-task plan.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, with checkpoints at task boundaries 10, 15, 20, 25, 28, 34.

Which approach?




