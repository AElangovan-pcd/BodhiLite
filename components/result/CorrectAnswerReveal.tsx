'use client';

import type { AnswerSnapshot, Response } from '@/lib/grading';

export function CorrectAnswerReveal({
  snapshot,
  response,
}: {
  snapshot: AnswerSnapshot;
  response: Response | null;
}) {
  const target = snapshot.render.grading_target;
  switch (target.kind) {
    case 'mc': {
      const body = snapshot.render.rendered_body;
      const correctLabel =
        body.kind === 'mc'
          ? (body.choices.find((c) => c.id === target.correct_id)?.label_substituted ??
            target.correct_id)
          : target.correct_id;
      return (
        <p className="text-sm">
          <strong>Correct answer:</strong> {correctLabel}
        </p>
      );
    }
    case 'ma': {
      const body = snapshot.render.rendered_body;
      const labels =
        body.kind === 'ma'
          ? target.correct_ids.map(
              (id) => body.choices.find((c) => c.id === id)?.label_substituted ?? id,
            )
          : target.correct_ids;
      return (
        <p className="text-sm">
          <strong>Correct answers:</strong> {labels.join(', ')}
        </p>
      );
    }
    case 'tf':
      return (
        <p className="text-sm">
          <strong>Correct:</strong> {target.correct ? 'True' : 'False'}
        </p>
      );
    case 'numeric': {
      const out = `${target.value} ± ${target.tolerance}`;
      const unparseable = response?.type === 'numeric' && !Number.isFinite(Number(response.value));
      return (
        <p className="text-sm">
          <strong>Expected:</strong> {out}
          {unparseable ? ' — your answer was not a number' : ''}
        </p>
      );
    }
    case 'short_answer':
      return (
        <p className="text-sm">
          <strong>Pattern:</strong> <code>{target.pattern}</code> (
          {target.case_insensitive ? 'case-insensitive' : 'case-sensitive'})
        </p>
      );
    case 'fill_in':
      return (
        <ul className="text-sm">
          {target.targets.map((t) => {
            const yours = response?.type === 'fill_in' ? (response.blanks[t.id] ?? '') : '';
            return (
              <li key={t.id}>
                <strong>Blank {t.id}:</strong> expected <code>{t.target}</code> — your answer:{' '}
                <code>{yours || '(blank)'}</code>
              </li>
            );
          })}
        </ul>
      );
  }
}
