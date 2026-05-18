-- =========================================================================
-- Helper: is the current auth.uid() an instructor?
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_instructor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'instructor');
$$;

-- =========================================================================
-- public.users
-- =========================================================================
CREATE POLICY users_self_select ON public.users FOR SELECT
  USING (id = (SELECT auth.uid()));

CREATE POLICY users_instructor_select_all ON public.users FOR SELECT
  USING (public.is_instructor());

-- =========================================================================
-- public.assessments
-- =========================================================================
-- Owners (instructors) full CRUD
CREATE POLICY assessments_owner_all ON public.assessments FOR ALL
  USING (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

-- Students see published assessments they have an attempt for, OR that they have an override on.
CREATE POLICY assessments_student_select ON public.assessments FOR SELECT
  USING (
    status = 'published'
    AND (
      EXISTS (SELECT 1 FROM public.attempts a
              WHERE a.assessment_id = assessments.id
                AND a.student_user_id = (SELECT auth.uid()))
      OR
      EXISTS (SELECT 1 FROM public.assessment_overrides ovr
              WHERE ovr.assessment_id = assessments.id
                AND ovr.student_user_id = (SELECT auth.uid()))
    )
  );

-- =========================================================================
-- public.questions  (visible to instructor-owner; students see via attempt)
-- =========================================================================
CREATE POLICY questions_owner_all ON public.questions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.assessments a
                 WHERE a.id = questions.assessment_id
                   AND a.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessments a
                      WHERE a.id = questions.assessment_id
                        AND a.owner_user_id = (SELECT auth.uid())));

CREATE POLICY questions_student_select ON public.questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.attempts att
                 WHERE att.assessment_id = questions.assessment_id
                   AND att.student_user_id = (SELECT auth.uid())));

-- =========================================================================
-- public.question_variables  (variables follow the question's policy)
-- =========================================================================
CREATE POLICY question_variables_owner_all ON public.question_variables FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.assessments a ON a.id = q.assessment_id
    WHERE q.id = question_variables.question_id
      AND a.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.assessments a ON a.id = q.assessment_id
    WHERE q.id = question_variables.question_id
      AND a.owner_user_id = (SELECT auth.uid())));

CREATE POLICY question_variables_student_select ON public.question_variables FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.attempts att ON att.assessment_id = q.assessment_id
    WHERE q.id = question_variables.question_id
      AND att.student_user_id = (SELECT auth.uid())));

-- =========================================================================
-- public.attempts
-- =========================================================================
CREATE POLICY attempts_student_select ON public.attempts FOR SELECT
  USING (student_user_id = (SELECT auth.uid()));

CREATE POLICY attempts_student_insert ON public.attempts FOR INSERT
  WITH CHECK (student_user_id = (SELECT auth.uid()));

CREATE POLICY attempts_student_update_own ON public.attempts FOR UPDATE
  USING (student_user_id = (SELECT auth.uid()))
  WITH CHECK (student_user_id = (SELECT auth.uid()));

CREATE POLICY attempts_instructor_select ON public.attempts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.assessments a
                 WHERE a.id = attempts.assessment_id
                   AND a.owner_user_id = (SELECT auth.uid())));

-- =========================================================================
-- public.answers
-- =========================================================================
CREATE POLICY answers_student_select ON public.answers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.attempts att
                 WHERE att.id = answers.attempt_id
                   AND att.student_user_id = (SELECT auth.uid())));

CREATE POLICY answers_student_insert ON public.answers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.attempts att
                      WHERE att.id = answers.attempt_id
                        AND att.student_user_id = (SELECT auth.uid())));

CREATE POLICY answers_student_update_own ON public.answers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.attempts att
                 WHERE att.id = answers.attempt_id
                   AND att.student_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.attempts att
                      WHERE att.id = answers.attempt_id
                        AND att.student_user_id = (SELECT auth.uid())));

CREATE POLICY answers_instructor_select ON public.answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.attempts att
    JOIN public.assessments a ON a.id = att.assessment_id
    WHERE att.id = answers.attempt_id
      AND a.owner_user_id = (SELECT auth.uid())));

-- =========================================================================
-- public.assessment_overrides
-- =========================================================================
CREATE POLICY overrides_owner_all ON public.assessment_overrides FOR ALL
  USING (EXISTS (SELECT 1 FROM public.assessments a
                 WHERE a.id = assessment_overrides.assessment_id
                   AND a.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessments a
                      WHERE a.id = assessment_overrides.assessment_id
                        AND a.owner_user_id = (SELECT auth.uid())));

CREATE POLICY overrides_student_select_own ON public.assessment_overrides FOR SELECT
  USING (student_user_id = (SELECT auth.uid()));

-- =========================================================================
-- public.audit_log  (insert by anyone authenticated; reads only by instructors)
-- =========================================================================
CREATE POLICY audit_log_insert_auth ON public.audit_log FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY audit_log_instructor_select ON public.audit_log FOR SELECT
  USING (public.is_instructor());

-- =========================================================================
-- public.media  (owner full CRUD; others must use signed URLs for storage)
-- =========================================================================
CREATE POLICY media_owner_all ON public.media FOR ALL
  USING (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));
