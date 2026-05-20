import { z } from 'zod';

export const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

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
    name: z.string().regex(IDENT_RE),
    position: z.number().int().min(1),
    type: z.literal('choice'),
    spec: ChoiceSpec,
  }),
  z.object({
    name: z.string().regex(IDENT_RE),
    position: z.number().int().min(1),
    type: z.literal('chemistry_compound'),
    spec: ChemistryCompoundSpec,
  }),
  z.object({
    name: z.string().regex(IDENT_RE),
    position: z.number().int().min(1),
    type: z.literal('randint'),
    spec: RandintSpec,
  }),
  z.object({
    name: z.string().regex(IDENT_RE),
    position: z.number().int().min(1),
    type: z.literal('randfloat'),
    spec: RandfloatSpec,
  }),
  z.object({
    name: z.string().regex(IDENT_RE),
    position: z.number().int().min(1),
    type: z.literal('derived'),
    spec: DerivedSpec,
  }),
]);

export type VariableSpec = z.infer<typeof VariableSpecSchema>;
