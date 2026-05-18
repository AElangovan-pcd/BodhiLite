CREATE TABLE public.audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID REFERENCES public.users(id),
  action          TEXT NOT NULL,
  target_kind     TEXT NOT NULL,
  target_id       UUID,
  before          JSONB,
  after           JSONB,
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_target ON public.audit_log (target_kind, target_id);
CREATE INDEX idx_audit_log_at ON public.audit_log (at DESC);

-- Reject UPDATE and DELETE at the trigger level
CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are immutable';
END;
$$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
