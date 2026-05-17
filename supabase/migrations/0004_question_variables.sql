CREATE TYPE variable_type AS ENUM ('choice', 'randint', 'randfloat', 'derived', 'chemistry_compound');

CREATE TABLE public.question_variables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          variable_type NOT NULL,
  spec          JSONB NOT NULL,
  position      INT  NOT NULL,
  UNIQUE (question_id, name),
  UNIQUE (question_id, position)
);

CREATE INDEX idx_question_variables_question ON public.question_variables (question_id);

ALTER TABLE public.question_variables ENABLE ROW LEVEL SECURITY;
