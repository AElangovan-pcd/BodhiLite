-- SECURITY DEFINER helpers to break potential RLS recursion and to provide
-- atomic multi-row writes for attempt start + attempt submit.
-- Follows the established pattern from 0011 / 0012 / 0013.

-- ============================================================
-- Helper 1: student_owns_in_progress_attempt
-- Used by the answers UPDATE policy to gate autosave writes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.student_owns_in_progress_attempt(
  p_attempt_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM attempts
    WHERE id = p_attempt_id
      AND student_user_id = p_user_id
      AND status = 'in_progress'
  );
$$;

-- Tighten answers UPDATE policy: students can only update their own
-- in-progress attempts' answer rows (i.e., autosave, never post-submit).
DROP POLICY IF EXISTS answers_student_update ON public.answers;
CREATE POLICY answers_student_update ON public.answers
  FOR UPDATE
  USING (public.student_owns_in_progress_attempt(answers.attempt_id, (SELECT auth.uid())))
  WITH CHECK (public.student_owns_in_progress_attempt(answers.attempt_id, (SELECT auth.uid())));

-- ============================================================
-- Helper 2: start_attempt
-- Atomic INSERT into attempts + INSERT N answer rows with snapshots.
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_attempt(
  p_assessment_id uuid,
  p_student_user_id uuid,
  p_attempt_no integer,
  p_seed bigint,
  p_snapshots jsonb  -- [{question_id: uuid, snapshot: jsonb}, ...]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt_id uuid;
  v_entry jsonb;
BEGIN
  -- Caller must be the student themself.
  IF (SELECT auth.uid()) <> p_student_user_id THEN
    RAISE EXCEPTION 'unauthorized: caller is not p_student_user_id';
  END IF;

  INSERT INTO attempts (assessment_id, student_user_id, attempt_no, seed, status, started_at)
  VALUES (p_assessment_id, p_student_user_id, p_attempt_no, p_seed, 'in_progress', now())
  RETURNING id INTO v_attempt_id;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_snapshots) LOOP
    INSERT INTO answers (attempt_id, question_id, rendered_question_snapshot, response)
    VALUES (
      v_attempt_id,
      (v_entry->>'question_id')::uuid,
      v_entry->'snapshot',
      NULL
    );
  END LOOP;

  RETURN v_attempt_id;
END;
$$;

-- ============================================================
-- Helper 3: submit_attempt
-- Atomic UPDATE attempts + UPDATE N answer rows with grades.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_attempt(
  p_attempt_id uuid,
  p_grades jsonb,    -- [{question_id: uuid, auto_score: number, score_method: text}, ...]
  p_summary jsonb    -- { raw_score: number, max_score: number, percentage: number }
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
  v_grade jsonb;
  v_rows integer;
BEGIN
  -- Verify the attempt is in-progress AND owned by the caller.
  SELECT student_user_id INTO v_owner
  FROM attempts
  WHERE id = p_attempt_id AND status = 'in_progress';

  IF v_owner IS NULL OR v_owner <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized or already submitted';
  END IF;

  -- Write per-answer grades. Skipping snapshot column means the immutability
  -- trigger (0006) is not triggered.
  FOR v_grade IN SELECT * FROM jsonb_array_elements(p_grades) LOOP
    UPDATE answers SET
      auto_score = (v_grade->>'auto_score')::numeric,
      score_method = v_grade->>'score_method',
      graded_at = now(),
      updated_at = now()
    WHERE attempt_id = p_attempt_id
      AND question_id = (v_grade->>'question_id')::uuid;
  END LOOP;

  -- Finalize the attempt. Status guard makes this idempotent under race.
  UPDATE attempts SET
    status = 'submitted',
    submitted_at = now(),
    summary = p_summary
  WHERE id = p_attempt_id AND status = 'in_progress';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'race: attempt already submitted by another caller';
  END IF;
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.student_owns_in_progress_attempt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_attempt(uuid, uuid, integer, bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_attempt(uuid, jsonb, jsonb) TO authenticated;
