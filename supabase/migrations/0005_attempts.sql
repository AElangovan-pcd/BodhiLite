CREATE TYPE attempt_status AS ENUM ('in_progress', 'submitted', 'graded', 'auto_submitted');

CREATE TABLE public.attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_user_id   UUID NOT NULL REFERENCES public.users(id)       ON DELETE CASCADE,
  attempt_no        INT  NOT NULL CHECK (attempt_no >= 1),
  seed              BIGINT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  status            attempt_status NOT NULL DEFAULT 'in_progress',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_user_id, attempt_no)
);

CREATE INDEX idx_attempts_student ON public.attempts (student_user_id);
CREATE INDEX idx_attempts_assessment ON public.attempts (assessment_id);

ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
