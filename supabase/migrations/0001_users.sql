-- App-level users table; rows are created by a trigger when an auth.users row is inserted.
-- We keep auth.users (Supabase-managed) and public.users (app-managed) in 1:1 lockstep.

CREATE TYPE app_role AS ENUM ('instructor', 'student');

CREATE TABLE public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  role        app_role NOT NULL DEFAULT 'student',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: when an auth.users row is created, create a matching public.users row.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'student')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Enable RLS but defer policies to migration 0010.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
