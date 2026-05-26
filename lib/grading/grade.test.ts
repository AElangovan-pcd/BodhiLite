import { describe, it, expect } from 'vitest';
import { gradeAnswer } from './grade';
import type { AnswerSnapshot } from './snapshot';

function snap(
  grading_target: AnswerSnapshot['render']['grading_target'],
  type: AnswerSnapshot['question_type'],
  body: AnswerSnapshot['render']['rendered_body'] = { kind: 'tf' },
): AnswerSnapshot {
  return {
    question_id: 'q',
    question_type: type,
    seed: 0,
    rendered_at: '2026-05-26T00:00:00Z',
    render: {
      materialized_values: {},
      rendered_stem: 'stem',
      rendered_body: body,
      grading_target,
      validation_errors: [],
    },
  };
}

describe('gradeAnswer — mc', () => {
  const s = snap({ kind: 'mc', correct_id: 'b' }, 'mc', {
    kind: 'mc',
    choices: [
      { id: 'a', label_substituted: 'A' },
      { id: 'b', label_substituted: 'B' },
    ],
  });
  it('scores 1 for matching choice', () => {
    expect(gradeAnswer(s, { type: 'mc', choice_id: 'b' })).toEqual({
      ok: true,
      auto_score: 1,
      score_method: 'auto',
    });
  });
  it('scores 0 for wrong choice', () => {
    expect(gradeAnswer(s, { type: 'mc', choice_id: 'a' })).toEqual({
      ok: true,
      auto_score: 0,
      score_method: 'auto',
    });
  });
  it('scores 0 for null choice (unanswered)', () => {
    expect(gradeAnswer(s, { type: 'mc', choice_id: null })).toEqual({
      ok: true,
      auto_score: 0,
      score_method: 'auto',
    });
  });
  it('scores 0 for null response', () => {
    expect(gradeAnswer(s, null)).toEqual({
      ok: true,
      auto_score: 0,
      score_method: 'auto',
    });
  });
});

describe('gradeAnswer — ma strict', () => {
  const s = snap({ kind: 'ma', correct_ids: ['a', 'c'], partial_credit: false }, 'ma', {
    kind: 'ma',
    choices: [
      { id: 'a', label_substituted: 'A' },
      { id: 'b', label_substituted: 'B' },
      { id: 'c', label_substituted: 'C' },
    ],
  });
  it('1 when set equals', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a', 'c'] }).auto_score).toBe(1);
  });
  it('0 when subset', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a'] }).auto_score).toBe(0);
  });
  it('0 when superset', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a', 'b', 'c'] }).auto_score).toBe(0);
  });
  it('0 when disjoint', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['b'] }).auto_score).toBe(0);
  });
});

describe('gradeAnswer — ma partial credit', () => {
  const s = snap({ kind: 'ma', correct_ids: ['a', 'c'], partial_credit: true }, 'ma', {
    kind: 'ma',
    choices: [
      { id: 'a', label_substituted: 'A' },
      { id: 'b', label_substituted: 'B' },
      { id: 'c', label_substituted: 'C' },
    ],
  });
  it('1.0 when all correct picked, none wrong', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a', 'c'] }).auto_score).toBe(1);
  });
  it('0.5 when half correct picked', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a'] }).auto_score).toBe(0.5);
  });
  it('0 when one wrong cancels one right', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['a', 'b'] }).auto_score).toBe(0);
  });
  it('floors at 0 when wrongs exceed rights', () => {
    expect(gradeAnswer(s, { type: 'ma', choice_ids: ['b'] }).auto_score).toBe(0);
  });
});

describe('gradeAnswer — tf', () => {
  const s = snap({ kind: 'tf', correct: true }, 'tf');
  it('1 on match', () => {
    expect(gradeAnswer(s, { type: 'tf', value: true }).auto_score).toBe(1);
  });
  it('0 on mismatch', () => {
    expect(gradeAnswer(s, { type: 'tf', value: false }).auto_score).toBe(0);
  });
  it('0 on null (unanswered)', () => {
    expect(gradeAnswer(s, { type: 'tf', value: null }).auto_score).toBe(0);
  });
});

describe('gradeAnswer — numeric', () => {
  const s = snap({ kind: 'numeric', value: 4.5, tolerance: 0.01 }, 'numeric', {
    kind: 'numeric',
  });
  it('1 within tolerance', () => {
    expect(gradeAnswer(s, { type: 'numeric', value: '4.505' }).auto_score).toBe(1);
  });
  it('0 outside tolerance', () => {
    expect(gradeAnswer(s, { type: 'numeric', value: '4.6' }).auto_score).toBe(0);
  });
  it('auto_error on unparseable', () => {
    const out = gradeAnswer(s, { type: 'numeric', value: 'not a number' });
    expect(out).toMatchObject({ ok: false, auto_score: 0, score_method: 'auto_error' });
  });
  it('empty string → 0, no error', () => {
    expect(gradeAnswer(s, { type: 'numeric', value: '' })).toEqual({
      ok: true,
      auto_score: 0,
      score_method: 'auto',
    });
  });
});

describe('gradeAnswer — short_answer', () => {
  const s = snap(
    { kind: 'short_answer', pattern: '^NaCl$', case_insensitive: true },
    'short_answer',
    { kind: 'short_answer' },
  );
  it('1 on match (case-insensitive)', () => {
    expect(gradeAnswer(s, { type: 'short_answer', value: 'nacl' }).auto_score).toBe(1);
  });
  it('0 on mismatch', () => {
    expect(gradeAnswer(s, { type: 'short_answer', value: 'KCl' }).auto_score).toBe(0);
  });
  it('0 on empty (no error)', () => {
    expect(gradeAnswer(s, { type: 'short_answer', value: '   ' })).toEqual({
      ok: true,
      auto_score: 0,
      score_method: 'auto',
    });
  });
  it('auto_error on invalid regex (defense)', () => {
    const bad = snap(
      { kind: 'short_answer', pattern: '([', case_insensitive: false },
      'short_answer',
      { kind: 'short_answer' },
    );
    expect(gradeAnswer(bad, { type: 'short_answer', value: 'x' }).ok).toBe(false);
  });
});

describe('gradeAnswer — fill_in', () => {
  const s = snap(
    {
      kind: 'fill_in',
      targets: [
        { id: 'b1', target: 'NaCl', case_insensitive: true },
        { id: 'b2', target: '58.44', case_insensitive: false },
      ],
    },
    'fill_in',
    { kind: 'fill_in', blanks: [{ id: 'b1' }, { id: 'b2' }] },
  );
  it('1 when all blanks match', () => {
    expect(
      gradeAnswer(s, { type: 'fill_in', blanks: { b1: 'NaCl', b2: '58.44' } }).auto_score,
    ).toBe(1);
  });
  it('0.5 when one of two blanks match', () => {
    expect(
      gradeAnswer(s, { type: 'fill_in', blanks: { b1: 'nacl', b2: 'wrong' } }).auto_score,
    ).toBe(0.5);
  });
  it('0 when no blanks match', () => {
    expect(gradeAnswer(s, { type: 'fill_in', blanks: { b1: 'x', b2: 'y' } }).auto_score).toBe(0);
  });
  it('missing blank entry → 0 for that blank', () => {
    expect(gradeAnswer(s, { type: 'fill_in', blanks: { b1: 'NaCl' } }).auto_score).toBe(0.5);
  });
});
