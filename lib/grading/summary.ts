import type { GradeResult } from './grade';

export type AttemptSummary = {
  raw_score: number;
  max_score: number;
  percentage: number;
};

export function computeAttemptSummary(results: readonly GradeResult[]): AttemptSummary {
  const max_score = results.length;
  const raw_score = results.reduce((sum, r) => sum + r.auto_score, 0);
  const pct = max_score > 0 ? (raw_score / max_score) * 100 : 0;
  return {
    raw_score,
    max_score,
    percentage: Math.round(pct * 100) / 100,
  };
}
