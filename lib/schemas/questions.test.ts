import { describe, it, expect } from 'vitest';
import { QuestionSchema } from './questions';

describe('QuestionSchema — mc', () => {
  it('accepts a valid mc', () => {
    const r = QuestionSchema.safeParse({
      type: 'mc',
      body: {
        stem: 'Which gas?',
        choices: [
          { id: 'a', label: 'O2' },
          { id: 'b', label: 'N2' },
        ],
      },
      scoring: { correct_id: 'a' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects mc with < 2 choices', () => {
    const r = QuestionSchema.safeParse({
      type: 'mc',
      body: { stem: 'x', choices: [{ id: 'a', label: 'A' }] },
      scoring: { correct_id: 'a' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects mc whose correct_id is not a choice', () => {
    const r = QuestionSchema.safeParse({
      type: 'mc',
      body: {
        stem: 'x',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
      scoring: { correct_id: 'c' },
    });
    expect(r.success).toBe(false);
  });
});

describe('QuestionSchema — numeric', () => {
  it('accepts valid numeric', () => {
    const r = QuestionSchema.safeParse({
      type: 'numeric',
      body: { stem: 'How many moles of {{c}} in {{m}} g?', units: 'mol' },
      scoring: { formula: 'm / molar_mass(c)', tolerance: 0.01 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects numeric with negative tolerance', () => {
    const r = QuestionSchema.safeParse({
      type: 'numeric',
      body: { stem: 'x' },
      scoring: { formula: '1', tolerance: -0.01 },
    });
    expect(r.success).toBe(false);
  });
});

describe('QuestionSchema — short_answer', () => {
  it('rejects invalid regex', () => {
    const r = QuestionSchema.safeParse({
      type: 'short_answer',
      body: { stem: 'x' },
      scoring: { pattern: '[unclosed', case_insensitive: false },
    });
    expect(r.success).toBe(false);
  });
});

describe('QuestionSchema — fill_in', () => {
  it('accepts valid fill_in with matching blanks', () => {
    const r = QuestionSchema.safeParse({
      type: 'fill_in',
      body: {
        stem: 'The capital of France is {{blank:capital}}.',
        blanks: [{ id: 'capital' }],
      },
      scoring: {
        targets: [{ id: 'capital', target: 'Paris', case_insensitive: true }],
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects fill_in with stem/scoring id mismatch', () => {
    const r = QuestionSchema.safeParse({
      type: 'fill_in',
      body: { stem: 'X is {{blank:a}}.', blanks: [{ id: 'a' }] },
      scoring: { targets: [{ id: 'b', target: 'Y' }] },
    });
    expect(r.success).toBe(false);
  });
});

describe('QuestionSchema — common', () => {
  it('rejects empty stem (after trim)', () => {
    const r = QuestionSchema.safeParse({
      type: 'tf',
      body: { stem: '   ' },
      scoring: { correct: true },
    });
    expect(r.success).toBe(false);
  });

  it('accepts valid tf', () => {
    const r = QuestionSchema.safeParse({
      type: 'tf',
      body: { stem: 'Water is wet.' },
      scoring: { correct: true },
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid ma', () => {
    const r = QuestionSchema.safeParse({
      type: 'ma',
      body: {
        stem: 'Pick all',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
        ],
      },
      scoring: { correct_ids: ['a', 'c'] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid short_answer pattern', () => {
    const r = QuestionSchema.safeParse({
      type: 'short_answer',
      body: { stem: 'Name a noble gas.' },
      scoring: { pattern: '^(He|Ne|Ar|Kr|Xe|Rn)$', case_insensitive: true },
    });
    expect(r.success).toBe(true);
  });
});
