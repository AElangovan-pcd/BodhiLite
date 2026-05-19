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
