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
  formula: z.string().min(1, { message: 'Grading formula must not be empty' }),
  tolerance: z.number().min(0, { message: 'Tolerance must be ≥ 0' }),
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
      try {
        new RegExp(s.pattern);
        return true;
      } catch {
        return false;
      }
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

const Mc = z
  .object({ type: z.literal('mc'), body: McBody, scoring: McScoring })
  .refine(
    (q) => q.body.choices.some((c) => c.id === q.scoring.correct_id),
    { message: 'correct_id must match one of the choices', path: ['scoring', 'correct_id'] },
  );

const Ma = z
  .object({ type: z.literal('ma'), body: MaBody, scoring: MaScoring })
  .refine(
    (q) => {
      const ids = new Set(q.body.choices.map((c) => c.id));
      return q.scoring.correct_ids.every((id) => ids.has(id));
    },
    { message: 'every correct id must match a choice', path: ['scoring', 'correct_ids'] },
  );

const Tf = z.object({ type: z.literal('tf'), body: TfBody, scoring: TfScoring });

const Numeric = z.object({
  type: z.literal('numeric'),
  body: NumericBody,
  scoring: NumericScoring,
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

export const QuestionSchema = z.discriminatedUnion('type', [Mc, Ma, Tf, Numeric, ShortAnswer, FillIn]);

export type Question = z.infer<typeof QuestionSchema>;
export type QuestionType = Question['type'];
