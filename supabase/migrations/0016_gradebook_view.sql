-- Per-(assessment, student) aggregate row for the instructor gradebook.
-- RLS-aware via attempts policies (security_invoker = true is default in PG ≥ 15).
CREATE OR REPLACE VIEW public.gradebook_rows AS
SELECT
  a.assessment_id,
  a.student_user_id,
  u.email AS student_email,
  COUNT(*) FILTER (WHERE a.status = 'submitted') AS attempts_used,
  MAX((a.summary->>'raw_score')::numeric)
    FILTER (WHERE a.status = 'submitted') AS best_raw,
  MAX((a.summary->>'max_score')::numeric)
    FILTER (WHERE a.status = 'submitted') AS best_max,
  MAX((a.summary->>'percentage')::numeric)
    FILTER (WHERE a.status = 'submitted') AS best_pct,
  MAX(a.submitted_at) FILTER (WHERE a.status = 'submitted') AS last_submitted_at,
  (
    SELECT id FROM attempts a2
    WHERE a2.assessment_id = a.assessment_id
      AND a2.student_user_id = a.student_user_id
      AND a2.status = 'submitted'
    ORDER BY (a2.summary->>'raw_score')::numeric DESC NULLS LAST,
             a2.submitted_at DESC
    LIMIT 1
  ) AS best_attempt_id
FROM public.attempts a
JOIN public.users u ON u.id = a.student_user_id
GROUP BY a.assessment_id, a.student_user_id, u.email;

GRANT SELECT ON public.gradebook_rows TO authenticated;
