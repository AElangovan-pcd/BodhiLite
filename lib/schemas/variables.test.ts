import { describe, it, expect } from 'vitest';
import { VariableSpecSchema } from './variables';

describe('VariableSpecSchema', () => {
  it('accepts a valid choice spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'compound',
      type: 'choice',
      position: 1,
      spec: { values: ['NaCl', 'KCl', 'CaCl2'] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid chemistry_compound spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'salt',
      type: 'chemistry_compound',
      position: 1,
      spec: {
        values: [
          { label: 'NaCl', smiles: '[Na+].[Cl-]' },
          { label: 'KBr', smiles: '[K+].[Br-]' },
        ],
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid randint spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'mass',
      type: 'randint',
      position: 2,
      spec: { min: 10, max: 200, step: 5, units: 'g' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid randfloat spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'volume',
      type: 'randfloat',
      position: 2,
      spec: { min: 0.1, max: 10, decimals: 2, units: 'L' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid derived spec', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'moles',
      type: 'derived',
      position: 3,
      spec: { expression: 'mass / molar_mass(compound)' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid name', () => {
    const r = VariableSpecSchema.safeParse({
      name: '1bad',
      type: 'choice',
      position: 1,
      spec: { values: ['a'] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects randint with min >= max', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'x',
      type: 'randint',
      position: 1,
      spec: { min: 10, max: 5 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty choice values array', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'x',
      type: 'choice',
      position: 1,
      spec: { values: [] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects chemistry_compound with empty label', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'x',
      type: 'chemistry_compound',
      position: 1,
      spec: { values: [{ label: '', smiles: 'C' }] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects derived with empty expression', () => {
    const r = VariableSpecSchema.safeParse({
      name: 'x',
      type: 'derived',
      position: 1,
      spec: { expression: '' },
    });
    expect(r.success).toBe(false);
  });
});
