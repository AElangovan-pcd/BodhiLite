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

  const stem = substitute((input.question.body['stem'] as string) ?? '', materialized);

  let body: RenderedBody;
  let target: GradingTarget;

  try {
    switch (input.question.type) {
      case 'mc': {
        const rawChoices = input.question.body['choices'];
        const choices: { id: string; label: string }[] = Array.isArray(rawChoices)
          ? rawChoices
          : [];
        body = {
          kind: 'mc',
          choices: choices.map((c) => ({
            id: typeof c?.id === 'string' ? c.id : '',
            label_substituted: substitute(
              typeof c?.label === 'string' ? c.label : '',
              materialized,
            ),
          })),
        };
        target = {
          kind: 'mc',
          correct_id: (input.question.scoring['correct_id'] as string) ?? '',
        };
        break;
      }
      case 'ma': {
        const rawChoices = input.question.body['choices'];
        const choices: { id: string; label: string }[] = Array.isArray(rawChoices)
          ? rawChoices
          : [];
        body = {
          kind: 'ma',
          choices: choices.map((c) => ({
            id: typeof c?.id === 'string' ? c.id : '',
            label_substituted: substitute(
              typeof c?.label === 'string' ? c.label : '',
              materialized,
            ),
          })),
        };
        target = {
          kind: 'ma',
          correct_ids: (input.question.scoring['correct_ids'] as string[]) ?? [],
          partial_credit: Boolean(input.question.scoring['partial_credit']),
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
          pattern: substitute((input.question.scoring['pattern'] as string) ?? '', materialized),
          case_insensitive: Boolean(input.question.scoring['case_insensitive']),
        };
        break;
      }
      case 'fill_in': {
        const rawBlanks = input.question.body['blanks'];
        const blanks: { id: string; prompt?: string }[] = Array.isArray(rawBlanks) ? rawBlanks : [];
        body = { kind: 'fill_in', blanks };
        const rawTargetsAny = input.question.scoring['targets'];
        const rawTargets: { id: string; target: string; case_insensitive?: boolean }[] =
          Array.isArray(rawTargetsAny) ? rawTargetsAny : [];
        target = {
          kind: 'fill_in',
          targets: rawTargets.map((t) => ({
            id: t.id,
            target: substitute(typeof t?.target === 'string' ? t.target : '', materialized),
            case_insensitive: Boolean(t.case_insensitive),
          })),
        };
        break;
      }
    }
  } catch (e) {
    errors.push(`Render error: ${(e as Error).message}`);
    body = { kind: 'tf' };
    target = { kind: 'tf', correct: false };
  }

  return {
    materialized_values: materialized,
    rendered_stem: stem,
    rendered_body: body!,
    grading_target: target!,
    validation_errors: errors,
  };
}
