import { renderQuestion } from '@/lib/rendering';
import type { RenderInput, RenderOutput } from '@/lib/rendering';
import type { QuestionType } from '@/lib/schemas';

export type AnswerSnapshot = {
  question_id: string;
  question_type: QuestionType;
  seed: number;
  rendered_at: string;
  render: RenderOutput;
};

export type BuildSnapshotInput = {
  question: RenderInput['question'] & { id: string };
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
