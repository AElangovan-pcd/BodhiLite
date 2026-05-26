-- Relax three Plan 1 RLS policies that gated student SELECTs on "has-an-attempt-already."
-- That gate was a chicken-and-egg for the Plan 3 /take/[id] flow: a student needs to
-- read the assessment + its questions + its variables in order to build the snapshot
-- payload for start_attempt, but they don't have an attempt yet — so the policies
-- returned 0 rows and the take page rendered blank.
--
-- Defense-in-depth is preserved:
--   - attempts/answers RLS still scope per-student (attempts_student_select, etc.)
--   - start_attempt RPC verifies caller is the student themselves
--   - Only 'published' assessments are visible; drafts/archived stay hidden

DROP POLICY IF EXISTS assessments_student_select ON public.assessments;
CREATE POLICY assessments_student_select ON public.assessments FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS questions_student_select ON public.questions;
CREATE POLICY questions_student_select ON public.questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = questions.assessment_id
      AND a.status = 'published'
  ));

DROP POLICY IF EXISTS question_variables_student_select ON public.question_variables;
CREATE POLICY question_variables_student_select ON public.question_variables FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.assessments a ON a.id = q.assessment_id
    WHERE q.id = question_variables.question_id
      AND a.status = 'published'
  ));
