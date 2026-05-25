import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { QuestionEditorClient } from './client';
import type { QuestionType } from '@/lib/schemas';
import type { VariableType } from '@/components/editor/VariablesSection';

export const dynamic = 'force-dynamic';

export default async function QuestionEditorPage({
  params,
}: {
  params: Promise<{ id: string; qid: string }>;
}) {
  const { id, qid } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: q } = await supabase
    .from('questions')
    .select('id, position, type, body, scoring, question_variables(name, type, position, spec)')
    .eq('id', qid)
    .single();
  if (!q) notFound();

  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_id', id);

  const initial = {
    // DB enum is wider than QuestionType (includes future chem types); cast is safe
    // because the editor only renders what renderQuestion supports.
    type: q.type as QuestionType,
    body: q.body as Record<string, unknown>,
    scoring: q.scoring as Record<string, unknown>,
    variables: (q.question_variables ?? []).map((v) => ({
      ...v,
      // DB text column is wider than VariableType; cast is safe because the DB
      // enum only contains these 5 values (enforced by the questions_type_check constraint).
      type: v.type as VariableType,
      spec: v.spec as Record<string, unknown>,
    })),
  };

  return (
    <QuestionEditorClient
      assessmentId={id}
      questionId={qid}
      position={q.position}
      totalQuestions={count ?? 1}
      initial={initial}
    />
  );
}
