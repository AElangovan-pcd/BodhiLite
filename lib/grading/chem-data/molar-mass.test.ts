import { describe, it, expect } from 'vitest';
import { molarMass } from './molar-mass';

describe('molarMass', () => {
  it.each([
    ['H', 1.008],
    ['H2', 2.016],
    ['H2O', 18.015],
    ['CO2', 44.009],
    ['NaCl', 58.44],
    ['CaCO3', 100.087],
    ['NaOH', 39.997],
    ['H2SO4', 98.072],
    ['Mg(OH)2', 58.319],
    ['Ca(OH)2', 74.092],
    ['Al2(SO4)3', 342.132],
    ['C6H12O6', 180.156],
    ['NH4NO3', 80.043],
    ['(NH4)2SO4', 132.134],
    ['CuSO4', 159.602],
    ['KMnO4', 158.034],
    ['K2Cr2O7', 294.184],
  ])('molarMass(%s) ≈ %f', (formula, expected) => {
    expect(molarMass(formula)).toBeCloseTo(expected, 2);
  });

  it('throws on unknown element', () => {
    expect(() => molarMass('Xy2')).toThrow();
  });

  it('throws on malformed formula', () => {
    expect(() => molarMass('123abc')).toThrow();
  });
});
