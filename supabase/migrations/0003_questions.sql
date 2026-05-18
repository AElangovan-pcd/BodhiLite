CREATE TYPE question_type AS ENUM (
  'mc', 'ma', 'tf', 'numeric', 'short_answer', 'fill_in',
  'chem_draw_to_target', 'chem_pick_product', 'chem_identify_functional_group'
);

CREATE TABLE public.questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  position        INT  NOT NULL,
  type            question_type NOT NULL,
  body            JSONB NOT NULL DEFAULT '{}'::JSONB,
  scoring         JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, position)
);

CREATE INDEX idx_questions_assessment ON public.questions (assessment_id);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER questions_set_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
