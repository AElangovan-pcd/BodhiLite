CREATE TABLE public.answers (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id                    UUID NOT NULL REFERENCES public.attempts(id)  ON DELETE CASCADE,
  question_id                   UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  rendered_question_snapshot    JSONB,
  response                      JSONB,
  auto_score                    NUMERIC,
  manual_score                  NUMERIC,
  score_method                  TEXT,
  graded_at                     TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX idx_answers_attempt ON public.answers (attempt_id);

CREATE OR REPLACE FUNCTION public.enforce_snapshot_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.rendered_question_snapshot IS NOT NULL
     AND NEW.rendered_question_snapshot IS DISTINCT FROM OLD.rendered_question_snapshot THEN
    RAISE EXCEPTION 'rendered_question_snapshot is immutable once set';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER answers_snapshot_immutable
  BEFORE UPDATE ON public.answers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_snapshot_immutability();

CREATE TRIGGER answers_set_updated_at
  BEFORE UPDATE ON public.answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
