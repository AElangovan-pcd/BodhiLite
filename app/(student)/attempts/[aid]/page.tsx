import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStudent } from '@/lib/auth/require';
import { AttemptClient } from './client';
import type { AnswerSnapshot, Response } from '@/lib/grading';

type Props = { params: Promise<{ aid: string }> };

export default async function AttemptPage({ params }: Props) {
  const { aid } = await params;
  const { user } = await requireStudent();
  const supabase = await createServerSupabaseClient();

  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .select(
      'id, status, attempt_no, student_user_id, assessment_id, assessments(id, title, default_attempts)',
    )
    .eq('id', aid)
    .maybeSingle();
  if (aErr || !attempt) notFound();
  if (attempt.student_user_id !== user.id) notFound();
  if (
    attempt.status === 'submitted' ||
    attempt.status === 'auto_submitted' ||
    attempt.status === 'graded'
  ) {
    redirect(`/attempts/${aid}/result` as Route);
  }

  const { data: override } = await supabase
    .from('assessment_overrides')
    .select('extra_attempts')
    .eq('assessment_id', attempt.assessment_id)
    .eq('student_user_id', user.id)
    .maybeSingle();
  const assessment = attempt.assessments as unknown as {
    id: string;
    title: string;
    default_attempts: number;
  };
  const maxAttempts = (assessment.default_attempts ?? 1) + (override?.extra_attempts ?? 0);

  const { data: answers, error: nErr } = await supabase
    .from('answers')
    .select('question_id, rendered_question_snapshot, response')
    .eq('attempt_id', aid);
  if (nErr || !answers) notFound();

  const { data: qPos } = await supabase
    .from('questions')
    .select('id, position')
    .eq('assessment_id', attempt.assessment_id);
  const posByQid = new Map((qPos ?? []).map((q) => [q.id, q.position]));

  const cards = answers
    .map((row) => ({
      questionId: row.question_id,
      snapshot: row.rendered_question_snapshot as unknown as AnswerSnapshot,
      initialResponse: (row.response ?? null) as Response | null,
    }))
    .sort((a, b) => (posByQid.get(a.questionId) ?? 0) - (posByQid.get(b.questionId) ?? 0))
    .map((c, i) => ({ ...c, position: i }));

  return (
    <AttemptClient
      attemptId={aid}
      title={assessment.title}
      attemptNo={attempt.attempt_no}
      maxAttempts={maxAttempts}
      cards={cards}
    />
  );
}
