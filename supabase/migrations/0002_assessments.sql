CREATE TYPE assessment_type AS ENUM ('quiz', 'exam');
CREATE TYPE assessment_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE public.assessments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  status                assessment_status NOT NULL DEFAULT 'draft',
  assessment_type       assessment_type   NOT NULL DEFAULT 'quiz',
  time_limit_seconds    INT,
  randomize_questions   BOOLEAN NOT NULL DEFAULT FALSE,
  randomize_choices     BOOLEAN NOT NULL DEFAULT FALSE,
  default_attempts      INT NOT NULL DEFAULT 3 CHECK (default_attempts > 0),
  opens_at              TIMESTAMPTZ,
  closes_at             TIMESTAMPTZ,
  settings              JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, slug),
  CHECK (
    (assessment_type = 'quiz' AND time_limit_seconds IS NULL)
    OR
    (assessment_type = 'exam' AND time_limit_seconds IS NOT NULL AND time_limit_seconds > 0)
  )
);

CREATE INDEX idx_assessments_owner ON public.assessments (owner_user_id);
CREATE INDEX idx_assessments_status ON public.assessments (status) WHERE status = 'published';

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER assessments_set_updated_at
  BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
