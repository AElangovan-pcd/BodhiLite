import { describe, it, expect } from 'vitest';
import { renderQuestion } from './render';

describe('renderQuestion — mc', () => {
  it('substitutes {{var}} in stem and choice labels', () => {
    const out = renderQuestion({
      question: {
        type: 'mc',
        body: {
          stem: 'Pick the heavier: {{a}} or {{b}}?',
          choices: [
            { id: 'x', label: '{{a}}' },
            { id: 'y', label: '{{b}}' },
          ],
        },
        scoring: { correct_id: 'x' },
        variables: [
          { name: 'a', type: 'choice', position: 1, spec: { values: ['Iron'] } },
          { name: 'b', type: 'choice', position: 2, spec: { values: ['Gold'] } },
        ],
      },
      seed: 0,
    });
    expect(out.rendered_stem).toBe('Pick the heavier: Iron or Gold?');
    expect(out.rendered_body).toMatchObject({
      kind: 'mc',
      choices: [
        { id: 'x', label_substituted: 'Iron' },
        { id: 'y', label_substituted: 'Gold' },
      ],
    });
    expect(out.grading_target).toEqual({ kind: 'mc', correct_id: 'x' });
  });
});

describe('renderQuestion — numeric', () => {
  it('computes grading target by evaluating formula against materialized values', () => {
    const out = renderQuestion({
      question: {
        type: 'numeric',
        body: { stem: 'Find moles of {{c}} in {{m}} g' },
        scoring: { formula: 'm / molar_mass(c)', tolerance: 0.01 },
        variables: [
          {
            name: 'c',
            type: 'chemistry_compound',
            position: 1,
            spec: { values: [{ label: 'NaCl', smiles: '[Na+].[Cl-]' }] },
          },
          { name: 'm', type: 'randint', position: 2, spec: { min: 100, max: 100 } },
        ],
      },
      seed: 0,
    });
    expect(out.materialized_values.c).toMatchObject({ label: 'NaCl' });
    expect(out.materialized_values.m).toBe(100);
    expect(out.grading_target).toMatchObject({
      kind: 'numeric',
      value: expect.any(Number),
      tolerance: 0.01,
    });
    expect((out.grading_target as { value: number }).value).toBeCloseTo(100 / 58.44, 4);
  });
});

describe('renderQuestion — tf', () => {
  it('passes the correct boolean', () => {
    const out = renderQuestion({
      question: {
        type: 'tf',
        body: { stem: '{{x}} > 5' },
        scoring: { correct: true },
        variables: [{ name: 'x', type: 'randint', position: 1, spec: { min: 10, max: 10 } }],
      },
      seed: 0,
    });
    expect(out.rendered_stem).toBe('10 > 5');
    expect(out.grading_target).toEqual({ kind: 'tf', correct: true });
  });
});

describe('renderQuestion — determinism', () => {
  it('same seed produces identical RenderOutput', () => {
    const input = {
      question: {
        type: 'mc' as const,
        body: {
          stem: '{{a}}?',
          choices: [
            { id: 'x', label: 'X' },
            { id: 'y', label: 'Y' },
          ],
        },
        scoring: { correct_id: 'x' },
        variables: [
          {
            name: 'a',
            type: 'choice' as const,
            position: 1,
            spec: { values: ['One', 'Two', 'Three'] },
          },
        ],
      },
      seed: 7,
    };
    const a = renderQuestion(input);
    const b = renderQuestion(input);
    expect(a).toEqual(b);
  });
});

describe('renderQuestion — never throws contract', () => {
  it('returns sensible output when choices is not an array', () => {
    const out = renderQuestion({
      question: {
        type: 'mc',
        body: { stem: 'x', choices: 'corrupt-not-an-array' as unknown as never },
        scoring: { correct_id: 'a' },
        variables: [],
      },
      seed: 0,
    });
    expect(out).toBeDefined();
    expect(out.rendered_body).toMatchObject({ kind: 'mc', choices: [] });
    expect(out.validation_errors).toBeDefined();
  });

  it('returns sensible output when a choice element is missing label', () => {
    const out = renderQuestion({
      question: {
        type: 'mc',
        body: {
          stem: 'x',
          choices: [{ id: 'a' }, { id: 'b', label: 'B' }],
        },
        scoring: { correct_id: 'a' },
        variables: [],
      },
      seed: 0,
    });
    expect(out).toBeDefined();
    expect(out.rendered_body).toMatchObject({
      kind: 'mc',
      choices: [
        { id: 'a', label_substituted: '' },
        { id: 'b', label_substituted: 'B' },
      ],
    });
  });

  it('returns sensible output when fill_in blanks is not an array', () => {
    const out = renderQuestion({
      question: {
        type: 'fill_in',
        body: { stem: 'X is {{blank:a}}.', blanks: null as unknown as never },
        scoring: { targets: [{ id: 'a', target: 'Y' }] },
        variables: [],
      },
      seed: 0,
    });
    expect(out).toBeDefined();
    expect(out.rendered_body).toMatchObject({ kind: 'fill_in', blanks: [] });
  });

  it('collects materializer errors without throwing', () => {
    const out = renderQuestion({
      question: {
        type: 'numeric',
        body: { stem: 'x' },
        scoring: { formula: 'a + 1', tolerance: 0.01 },
        variables: [
          { name: 'a', type: 'derived', position: 1, spec: { expression: 'undefined_var' } },
        ],
      },
      seed: 0,
    });
    expect(out).toBeDefined();
    expect(out.validation_errors.length).toBeGreaterThan(0);
    expect(out.grading_target).toMatchObject({ kind: 'numeric', value: NaN, tolerance: 0.01 });
  });
});
