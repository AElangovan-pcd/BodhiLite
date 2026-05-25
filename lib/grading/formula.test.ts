import { describe, it, expect } from 'vitest';
import { evaluate, EvalError } from './formula';

const vars = { a: 3, b: 4, m: 25, compound: { label: 'NaCl', smiles: '[Na+].[Cl-]' } };

describe('evaluate — arithmetic', () => {
  it('handles basic arithmetic', () => {
    expect(evaluate('a + b', vars)).toBe(7);
    expect(evaluate('a * b', vars)).toBe(12);
    expect(evaluate('b - a', vars)).toBe(1);
    expect(evaluate('b / a', vars)).toBeCloseTo(1.333, 3);
    expect(evaluate('a ** 2', vars)).toBe(9);
  });

  it('handles parenthesization', () => {
    expect(evaluate('(a + b) * 2', vars)).toBe(14);
  });

  it('handles unary minus', () => {
    expect(evaluate('-a + b', vars)).toBe(1);
  });
});

describe('evaluate — whitelisted functions', () => {
  it('handles sqrt, log, exp, abs', () => {
    expect(evaluate('sqrt(16)', vars)).toBe(4);
    expect(evaluate('log(exp(1))', vars)).toBeCloseTo(1, 10);
    expect(evaluate('log10(100)', vars)).toBeCloseTo(2, 10);
    expect(evaluate('abs(-5)', vars)).toBe(5);
  });

  it('handles trig functions', () => {
    expect(evaluate('sin(0)', vars)).toBe(0);
    expect(evaluate('cos(0)', vars)).toBe(1);
  });

  it('handles min, max, pow', () => {
    expect(evaluate('min(2, 7)', vars)).toBe(2);
    expect(evaluate('max(2, 7)', vars)).toBe(7);
    expect(evaluate('pow(2, 8)', vars)).toBe(256);
  });

  it('handles molar_mass on a formula string literal', () => {
    expect(evaluate('molar_mass("NaCl")', vars)).toBeCloseTo(58.44, 2);
  });

  it('handles molar_mass on a chemistry_compound variable', () => {
    expect(evaluate('molar_mass(compound)', vars)).toBeCloseTo(58.44, 2);
  });

  it('handles atomic_number', () => {
    expect(evaluate('atomic_number("Fe")', vars)).toBe(26);
  });

  it('handles density on known compound', () => {
    expect(evaluate('density("H2O")', vars)).toBeCloseTo(0.997, 3);
  });
});

describe('evaluate — sandbox rejections', () => {
  it('rejects member access', () => {
    expect(() => evaluate('a.constructor', vars)).toThrow(EvalError);
  });

  it('rejects assignment', () => {
    expect(() => evaluate('a = 5', vars)).toThrow();
  });

  it('rejects unknown function', () => {
    expect(() => evaluate('unknown_fn(1)', vars)).toThrow(EvalError);
  });

  it('rejects unknown variable', () => {
    expect(() => evaluate('unknown', vars)).toThrow(EvalError);
  });

  it('rejects function literal call', () => {
    expect(() => evaluate('(() => 1)()', vars)).toThrow();
  });

  it('rejects template literal', () => {
    expect(() => evaluate('`hello`', vars)).toThrow();
  });

  it('rejects new expression', () => {
    expect(() => evaluate('new Date()', vars)).toThrow();
  });

  it('rejects this', () => {
    expect(() => evaluate('this', vars)).toThrow();
  });

  it('rejects bracket member access', () => {
    expect(() => evaluate('a["constructor"]', vars)).toThrow();
  });

  it('rejects BigInt literal as EvalError', () => {
    expect(() => evaluate('1n', vars)).toThrow(EvalError);
  });

  it('rejects regex literal as EvalError', () => {
    expect(() => evaluate('/abc/', vars)).toThrow(EvalError);
  });
});
