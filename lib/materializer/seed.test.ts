import { describe, it, expect } from 'vitest';
import { stableSeed } from './seed';

describe('stableSeed', () => {
  const fixture = {
    student_id: '00000000-0000-0000-0000-000000000001',
    assessment_id: '00000000-0000-0000-0000-000000000002',
    attempt_no: 1,
  };

  it('is deterministic for fixed inputs', async () => {
    const a = await stableSeed(fixture);
    const b = await stableSeed(fixture);
    expect(a).toBe(b);
  });

  it('differs when attempt_no changes', async () => {
    const a = await stableSeed(fixture);
    const b = await stableSeed({ ...fixture, attempt_no: 2 });
    expect(a).not.toBe(b);
  });

  it('differs when student_id changes', async () => {
    const a = await stableSeed(fixture);
    const b = await stableSeed({
      ...fixture,
      student_id: '00000000-0000-0000-0000-000000000003',
    });
    expect(a).not.toBe(b);
  });

  it('produces a finite non-negative integer < 2^53', async () => {
    const s = await stableSeed(fixture);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
