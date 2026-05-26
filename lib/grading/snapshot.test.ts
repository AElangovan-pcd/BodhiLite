import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './snapshot';

describe('buildSnapshot', () => {
  it('wraps RenderOutput with provenance fields', () => {
    const snap = buildSnapshot({
      question: {
        id: 'q1',
        type: 'mc',
        body: {
          stem: 'What is 2+2?',
          choices: [
            { id: 'a', label: '3' },
            { id: 'b', label: '4' },
            { id: 'c', label: '5' },
          ],
        },
        scoring: { correct_id: 'b' },
        variables: [],
      },
      seed: 42,
    });

    expect(snap.question_id).toBe('q1');
    expect(snap.question_type).toBe('mc');
    expect(snap.seed).toBe(42);
    expect(snap.rendered_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snap.render.grading_target).toEqual({ kind: 'mc', correct_id: 'b' });
    expect(snap.render.rendered_body.kind).toBe('mc');
  });

  it('precomputes numeric target by evaluating the formula at snapshot time', () => {
    const snap = buildSnapshot({
      question: {
        id: 'qn',
        type: 'numeric',
        body: { stem: 'Mass of x g?' },
        scoring: { formula: 'mass * 2', tolerance: 0.01 },
        variables: [{ name: 'mass', type: 'randint', position: 1, spec: { min: 10, max: 10 } }],
      },
      seed: 0,
    });
    expect(snap.render.grading_target).toMatchObject({
      kind: 'numeric',
      value: 20,
      tolerance: 0.01,
    });
  });

  it('substitutes regex pattern at snapshot time for short_answer', () => {
    const snap = buildSnapshot({
      question: {
        id: 'qs',
        type: 'short_answer',
        body: { stem: 'Name the compound' },
        scoring: { pattern: '^{{compound}}$', case_insensitive: true },
        variables: [{ name: 'compound', type: 'choice', position: 1, spec: { values: ['NaCl'] } }],
      },
      seed: 0,
    });
    expect(snap.render.grading_target).toMatchObject({
      kind: 'short_answer',
      pattern: '^NaCl$',
      case_insensitive: true,
    });
  });
});
