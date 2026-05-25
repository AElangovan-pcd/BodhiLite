import { describe, it, expect } from 'vitest';
import { mulberry32 } from './mulberry32';

describe('mulberry32', () => {
  it('returns a deterministic sequence for a fixed seed', () => {
    const rng = mulberry32(42);
    expect(rng()).toBeCloseTo(0.6011037519201636, 12);
    expect(rng()).toBeCloseTo(0.44829055899754167, 12);
    expect(rng()).toBeCloseTo(0.8524657934904099, 12);
  });

  it('two PRNGs seeded identically produce identical sequences', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('different seeds diverge by the first draw', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('all draws are in [0, 1)', () => {
    const rng = mulberry32(0);
    for (let i = 0; i < 10_000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
