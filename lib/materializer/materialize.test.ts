import { describe, it, expect } from 'vitest';
import { materialize } from './materialize';
import type { VariableSpec } from '@/lib/schemas/variables';

describe('materialize — non-derived types', () => {
  it('choice picks deterministically for a fixed seed', () => {
    const specs: VariableSpec[] = [
      { name: 'x', type: 'choice', position: 1, spec: { values: ['a', 'b', 'c'] } },
    ];
    const out = materialize(specs, 42);
    expect(out.x).toBe('b');
  });

  it('chemistry_compound returns the {label, smiles} object', () => {
    const specs: VariableSpec[] = [
      {
        name: 'salt',
        type: 'chemistry_compound',
        position: 1,
        spec: {
          values: [
            { label: 'NaCl', smiles: '[Na+].[Cl-]' },
            { label: 'KBr', smiles: '[K+].[Br-]' },
          ],
        },
      },
    ];
    const out = materialize(specs, 1);
    expect(out.salt).toEqual(
      expect.objectContaining({ label: expect.any(String), smiles: expect.any(String) }),
    );
  });

  it('randint respects step and bounds', () => {
    const specs: VariableSpec[] = [
      { name: 'm', type: 'randint', position: 1, spec: { min: 10, max: 100, step: 5 } },
    ];
    for (let seed = 0; seed < 100; seed++) {
      const v = materialize(specs, seed).m as number;
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(100);
      expect((v - 10) % 5).toBe(0);
    }
  });

  it('randfloat respects decimals and bounds', () => {
    const specs: VariableSpec[] = [
      { name: 'v', type: 'randfloat', position: 1, spec: { min: 0, max: 1, decimals: 2 } },
    ];
    for (let seed = 0; seed < 100; seed++) {
      const v = materialize(specs, seed).v as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-9);
    }
  });

  it('same seed + same specs ⇒ same output', () => {
    const specs: VariableSpec[] = [
      { name: 'a', type: 'choice', position: 1, spec: { values: ['x', 'y'] } },
      { name: 'b', type: 'randint', position: 2, spec: { min: 1, max: 10 } },
    ];
    const r1 = materialize(specs, 7);
    const r2 = materialize(specs, 7);
    expect(r1).toEqual(r2);
  });
});

describe('materialize — derived', () => {
  it('evaluates a single derived against earlier variables', () => {
    const specs: VariableSpec[] = [
      { name: 'a', type: 'randint', position: 1, spec: { min: 5, max: 5 } },
      { name: 'b', type: 'randint', position: 2, spec: { min: 7, max: 7 } },
      { name: 's', type: 'derived', position: 3, spec: { expression: 'a + b' } },
    ];
    const out = materialize(specs, 1);
    expect(out.a).toBe(5);
    expect(out.b).toBe(7);
    expect(out.s).toBe(12);
  });

  it('chains: derived can depend on another derived', () => {
    const specs: VariableSpec[] = [
      { name: 'm', type: 'randint', position: 1, spec: { min: 100, max: 100 } },
      { name: 'mm', type: 'derived', position: 2, spec: { expression: 'molar_mass("NaCl")' } },
      { name: 'moles', type: 'derived', position: 3, spec: { expression: 'm / mm' } },
    ];
    const out = materialize(specs, 1);
    expect(out.mm).toBeCloseTo(58.44, 2);
    expect(out.moles as number).toBeCloseTo(100 / 58.44, 4);
  });

  it('throws on derived referencing undefined variable', () => {
    const specs: VariableSpec[] = [
      { name: 'a', type: 'derived', position: 1, spec: { expression: 'undefined_var + 1' } },
    ];
    expect(() => materialize(specs, 1)).toThrow();
  });
});
