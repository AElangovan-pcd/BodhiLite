-- =========================================================================
-- Fix: infinite recursion when reading back a newly-inserted assessment row.
--
-- Root cause: assessments_student_select queries assessment_overrides (RLS on).
-- overrides_owner_all then queries assessments (RLS on) to check ownership,
-- which re-triggers assessments_student_select — infinite loop.
--
-- This cycle was latent but benign for pure SELECT queries (the planner short-
-- circuits on owner rows before reaching the student policy). It surfaces on
-- INSERT … RETURNING / SELECT-after-insert because Postgres evaluates all
-- applicable policies for the returned row, including student_select.
--
-- Fix: introduce a SECURITY DEFINER helper that checks "does the current user
-- own the assessment this override belongs to?" without touching RLS-protected
-- tables, then rewrite overrides_owner_all to use it.
-- =========================================================================

-- Helper: does the given user own the assessment that this override row belongs to?
-- SECURITY DEFINER bypasses RLS on public.assessments, breaking the cycle.
CREATE OR REPLACE FUNCTION public.instructor_owns_override_assessment(
  p_assessment_id UUID,
  p_user_id       UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE id = p_assessment_id
      AND owner_user_id = p_user_id
  );
$$;

-- Rewrite overrides_owner_all to use the helper instead of a direct
-- cross-table EXISTS that queries RLS-protected assessments.
DROP POLICY IF EXISTS overrides_owner_all ON public.assessment_overrides;

CREATE POLICY overrides_owner_all ON public.assessment_overrides FOR ALL
  USING (
    public.instructor_owns_override_assessment(assessment_id, (SELECT auth.uid()))
  )
  WITH CHECK (
    public.instructor_owns_override_assessment(assessment_id, (SELECT auth.uid()))
  );
