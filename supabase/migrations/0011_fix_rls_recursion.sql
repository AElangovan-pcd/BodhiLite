-- =========================================================================
-- Fix: infinite recursion between assessments_student_select and
--      attempts_instructor_select RLS policies.
--
-- Root cause: assessments_student_select queries public.attempts (RLS on),
-- which triggers attempts_instructor_select, which queries public.assessments
-- (RLS on), which triggers assessments_student_select — infinite loop.
--
-- Fix: introduce two SECURITY DEFINER helper functions that bypass RLS when
-- checking cross-table existence, then rewrite the policies to use them.
-- =========================================================================

-- Helper: does the given user have at least one attempt on the given assessment?
-- SECURITY DEFINER bypasses RLS on public.attempts, breaking the cycle.
CREATE OR REPLACE FUNCTION public.student_has_attempt(
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
    SELECT 1 FROM public.attempts
    WHERE assessment_id = p_assessment_id
      AND student_user_id = p_user_id
  );
$$;

-- Helper: does the given user own the given assessment?
-- SECURITY DEFINER bypasses RLS on public.assessments, breaking the cycle.
CREATE OR REPLACE FUNCTION public.instructor_owns_assessment(
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

-- =========================================================================
-- Rewrite assessments_student_select: use helper to avoid querying attempts
-- directly (which would trigger the cycle).
-- =========================================================================
DROP POLICY IF EXISTS assessments_student_select ON public.assessments;

CREATE POLICY assessments_student_select ON public.assessments FOR SELECT
  USING (
    status = 'published'
    AND (
      public.student_has_attempt(id, (SELECT auth.uid()))
      OR
      EXISTS (
        SELECT 1 FROM public.assessment_overrides ovr
        WHERE ovr.assessment_id = assessments.id
          AND ovr.student_user_id = (SELECT auth.uid())
      )
    )
  );

-- =========================================================================
-- Rewrite attempts_instructor_select: use helper to avoid querying assessments
-- directly (which would trigger the cycle).
-- =========================================================================
DROP POLICY IF EXISTS attempts_instructor_select ON public.attempts;

CREATE POLICY attempts_instructor_select ON public.attempts FOR SELECT
  USING (public.instructor_owns_assessment(assessment_id, (SELECT auth.uid())));
