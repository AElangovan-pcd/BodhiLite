CREATE TABLE public.assessment_overrides (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id             UUID NOT NULL REFERENCES public.users(id)       ON DELETE CASCADE,
  assessment_id               UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  extra_time_seconds          INT,
  extra_attempts              INT,
  available_until_override    TIMESTAMPTZ,
  alternative_format          TEXT,
  reason                      TEXT,
  granted_by_user_id          UUID NOT NULL REFERENCES public.users(id),
  granted_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  audit_log_id                UUID,
  UNIQUE (student_user_id, assessment_id)
);

CREATE INDEX idx_overrides_student ON public.assessment_overrides (student_user_id);
CREATE INDEX idx_overrides_assessment ON public.assessment_overrides (assessment_id);

ALTER TABLE public.assessment_overrides ENABLE ROW LEVEL SECURITY;
