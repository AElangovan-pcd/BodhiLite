-- attempts.summary holds the post-grade attempt-level rollup:
-- { raw_score: number, max_score: number, percentage: number }
-- NULL while in-progress; populated by submit_attempt() at submit time.
ALTER TABLE public.attempts
  ADD COLUMN summary JSONB;

-- Index for gradebook ORDER BY (submitted_at DESC) and resume lookups.
CREATE INDEX IF NOT EXISTS idx_attempts_assessment_student
  ON public.attempts (assessment_id, student_user_id, submitted_at DESC);
