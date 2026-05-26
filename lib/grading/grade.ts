import type { AnswerSnapshot } from './snapshot';
import type { Response } from './response';
import { isResponseEmpty } from './response';

export type GradeResult =
  | { ok: true; auto_score: number; score_method: 'auto' }
  | { ok: false; auto_score: 0; score_method: 'auto_error'; error: string };

function ok(score: number): GradeResult {
  return { ok: true, auto_score: score, score_method: 'auto' };
}

function err(message: string): GradeResult {
  return { ok: false, auto_score: 0, score_method: 'auto_error', error: message };
}

export function gradeAnswer(snapshot: AnswerSnapshot, response: Response | null): GradeResult {
  try {
    if (isResponseEmpty(response)) return ok(0);
    const r = response!;
    const target = snapshot.render.grading_target;

    switch (target.kind) {
      case 'mc': {
        if (r.type !== 'mc') return err('response type mismatch');
        return ok(r.choice_id === target.correct_id ? 1 : 0);
      }

      case 'ma': {
        if (r.type !== 'ma') return err('response type mismatch');
        const picks = new Set(r.choice_ids);
        const correct = new Set(target.correct_ids);
        const total_correct = correct.size;
        const total_choices =
          snapshot.render.rendered_body.kind === 'ma'
            ? snapshot.render.rendered_body.choices.length
            : 0;
        const total_wrong = Math.max(0, total_choices - total_correct);

        if (!target.partial_credit) {
          const sameSize = picks.size === correct.size;
          const allMatch = [...picks].every((id) => correct.has(id));
          return ok(sameSize && allMatch ? 1 : 0);
        }

        const correct_picks = [...picks].filter((id) => correct.has(id)).length;
        const wrong_picks = [...picks].filter((id) => !correct.has(id)).length;
        const rightScore = total_correct > 0 ? correct_picks / total_correct : 0;
        const wrongScore = total_wrong > 0 ? wrong_picks / total_wrong : 0;
        return ok(Math.max(0, rightScore - wrongScore));
      }

      case 'tf': {
        if (r.type !== 'tf') return err('response type mismatch');
        return ok(r.value === target.correct ? 1 : 0);
      }

      case 'numeric': {
        if (r.type !== 'numeric') return err('response type mismatch');
        const parsed = Number(r.value.trim());
        if (!Number.isFinite(parsed)) return err('unparseable response');
        return ok(Math.abs(parsed - target.value) <= target.tolerance ? 1 : 0);
      }

      case 'short_answer': {
        if (r.type !== 'short_answer') return err('response type mismatch');
        let re: RegExp;
        try {
          re = new RegExp(target.pattern, target.case_insensitive ? 'i' : '');
        } catch {
          return err('invalid pattern');
        }
        return ok(re.test(r.value.trim()) ? 1 : 0);
      }

      case 'fill_in': {
        if (r.type !== 'fill_in') return err('response type mismatch');
        const targets = target.targets;
        if (targets.length === 0) return ok(0);
        let correct_count = 0;
        for (const t of targets) {
          const raw = (r.blanks[t.id] ?? '').trim();
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
