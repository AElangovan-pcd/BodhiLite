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
