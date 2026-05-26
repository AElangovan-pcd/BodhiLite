import { describe, it, expect } from 'vitest';
import { computeAttemptSummary } from './summary';
import type { GradeResult } from './grade';

const ok = (score: number): GradeResult => ({
  ok: true,
  auto_score: score,
  score_method: 'auto',
});

describe('computeAttemptSummary', () => {
  it('sums per-question scores and computes percentage', () => {
    const s = computeAttemptSummary([ok(1), ok(0.5), ok(0)]);
    expect(s).toEqual({ raw_score: 1.5, max_score: 3, percentage: 50 });
  });
  it('rounds percentage to 2 decimal places', () => {
    const s = computeAttemptSummary([ok(1), ok(1), ok(0)]);
    expect(s.percentage).toBeCloseTo(66.67, 2);
  });
  it('empty attempt summary', () => {
    expect(computeAttemptSummary([])).toEqual({
      raw_score: 0,
      max_score: 0,
      percentage: 0,
    });
  });
  it('treats auto_error as 0 score (still counts toward max)', () => {
    const s = computeAttemptSummary([
      ok(1),
      { ok: false, auto_score: 0, score_method: 'auto_error', error: 'x' },
    ]);
    expect(s).toEqual({ raw_score: 1, max_score: 2, percentage: 50 });
  });
});
