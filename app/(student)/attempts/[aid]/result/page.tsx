import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStudent } from '@/lib/auth/require';
import { ResultPage, type ResultRow } from '@/components/result/ResultPage';
import { startAttemptAction } from '../../../take/[id]/actions';
import type { AnswerSnapshot, Response } from '@/lib/grading';

type Props = { params: Promise<{ aid: string }> };

export default async function StudentResultPage({ params }: Props) {
  const { aid } = await params;
  const { user } = await requireStudent();
  const supabase = await createServerSupabaseClient();

  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .select(
      'id, status, attempt_no, summary, submitted_at, student_user_id, assessment_id, assessments(id, title, default_attempts)',
    )
    .eq('id', aid)
    .maybeSingle();
  if (aErr || !attempt) notFound();
  if (attempt.student_user_id !== user.id) notFound();
  if (attempt.status === 'in_progress') redirect(`/attempts/${aid}` as Route);

  const assessment = attempt.assessments as unknown as {
    id: string;
    title: string;
    default_attempts: number;
  };
  const assessmentId = attempt.assessment_id;

  const { data: override } = await supabase
    .from('assessment_overrides')
    .select('extra_attempts')
    .eq('assessment_id', assessmentId)
    .eq('student_user_id', user.id)
    .maybeSingle();
  const maxAttempts = (assessment.default_attempts ?? 1) + (override?.extra_attempts ?? 0);

  const { count: submittedCount } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId)
    .eq('student_user_id', user.id)
    .eq('status', 'submitted');
  const attemptsRemaining = Math.max(0, maxAttempts - (submittedCount ?? 0));

  const { data: bestRow } = await supabase
    .from('attempts')
    .select('summary')
    .eq('assessment_id', assessmentId)
    .eq('student_user_id', user.id)
    .eq('status', 'submitted');
  const bestRaw = (bestRow ?? []).reduce<number | null>((acc, r) => {
    const s = (r.summary as { raw_score?: number } | null)?.raw_score ?? null;
    if (s == null) return acc;
    return acc == null ? s : Math.max(acc, s);
  }, null);

  const { data: answers } = await supabase
    .from('answers')
    .select('question_id, rendered_question_snapshot, response, auto_score, score_method')
    .eq('attempt_id', aid);
  const { data: qPos } = await supabase
    .from('questions')
    .select('id, position')
    .eq('assessment_id', assessmentId);
  const posByQid = new Map((qPos ?? []).map((q) => [q.id, q.position]));

  const rows: ResultRow[] = (answers ?? [])
    .map((row) => ({
      question_id: row.question_id,
      position: posByQid.get(row.question_id) ?? 0,
      snapshot: row.rendered_question_snapshot as unknown as AnswerSnapshot,
      response: (row.response ?? null) as Response | null,
      auto_score: row.auto_score as number | null,
      score_method: row.score_method as string | null,
    }))
    .sort((a, b) => a.position - b.position);

  async function startNewAction() {
    'use server';
    const r = await startAttemptAction(assessmentId);
    if (r.ok) {
      redirect(`/attempts/${r.attemptId}` as Route);
    }
  }

  return (
    <ResultPage
      actor="student"
      title={assessment.title}
      attemptNo={attempt.attempt_no}
      maxAttempts={maxAttempts}
      submittedAt={attempt.submitted_at}
      summary={
        attempt.summary as {
          raw_score: number;
          max_score: number;
          percentage: number;
        } | null
      }
      bestRaw={bestRaw}
      rows={rows}
      attemptsRemaining={attemptsRemaining}
      {...(attemptsRemaining > 0 ? { onStartNew: startNewAction } : {})}
    />
  );
}
