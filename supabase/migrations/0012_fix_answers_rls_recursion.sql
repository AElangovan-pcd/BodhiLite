-- =========================================================================
-- Fix: infinite recursion on assessments when evaluating answers_instructor_select.
--
-- answers_instructor_select joins attempts → assessments (both RLS-enabled).
-- Even after migration 0011, the nested policy evaluation of assessments can
-- still recurse through other policy/function chains.
--
-- Fix: introduce a SECURITY DEFINER helper that checks "does the current user
-- own the assessment that this attempt belongs to?" entirely outside RLS,
-- then rewrite answers_instructor_select to use it.
-- =========================================================================

-- Helper: given an attempt_id, is the current user the instructor who owns
-- the parent assessment?  Runs SECURITY DEFINER so neither attempts nor
-- assessments RLS fires inside this function.
CREATE OR REPLACE FUNCTION public.instructor_owns_attempt_assessment(
  p_attempt_id UUID,
  p_user_id    UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.attempts att
    JOIN public.assessments a ON a.id = att.assessment_id
    WHERE att.id = p_attempt_id
      AND a.owner_user_id = p_user_id
  );
$$;

-- Rewrite answers_instructor_select to avoid any direct cross-RLS joins.
DROP POLICY IF EXISTS answers_instructor_select ON public.answers;

CREATE POLICY answers_instructor_select ON public.answers FOR SELECT
  USING (
    public.instructor_owns_attempt_assessment(attempt_id, (SELECT auth.uid()))
  );
