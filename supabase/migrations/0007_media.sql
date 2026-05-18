CREATE TABLE public.media (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mime                TEXT NOT NULL,
  storage_path        TEXT NOT NULL UNIQUE,
  alt_text            TEXT NOT NULL CHECK (length(alt_text) > 0),
  attached_to_kind    TEXT,
  attached_to_id      UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_owner ON public.media (owner_user_id);

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
