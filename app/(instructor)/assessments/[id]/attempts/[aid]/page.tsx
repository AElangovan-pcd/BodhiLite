import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireInstructor } from '@/lib/auth/require';
import { ResultPage, type ResultRow } from '@/components/result/ResultPage';
import type { AnswerSnapshot, Response } from '@/lib/grading';

type Props = { params: Promise<{ id: string; aid: string }> };

export default async function InstructorDrilldownPage({ params }: Props) {
  const { id, aid } = await params;
  await requireInstructor();
  const supabase = await createServerSupabaseClient();

  const { data: attempt } = await supabase
    .from('attempts')
    .select(
      'id, attempt_no, status, submitted_at, summary, student_user_id, assessment_id, assessments(id, title, default_attempts), users:student_user_id(email)',
    )
    .eq('id', aid)
    .eq('assessment_id', id)
    .maybeSingle();
  if (!attempt) notFound();

  const assessment = attempt.assessments as unknown as {
    id: string;
    title: string;
    default_attempts: number;
  };
  const studentEmail = (attempt.users as unknown as { email: string } | null)?.email ?? 'unknown';

  const { data: allAttempts } = await supabase
    .from('attempts')
    .select('summary')
    .eq('assessment_id', id)
    .eq('student_user_id', attempt.student_user_id)
    .eq('status', 'submitted');
  const bestRaw = (allAttempts ?? []).reduce<number | null>((acc, r) => {
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
    .eq('assessment_id', id);
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

  return (
    <ResultPage
      actor="instructor"
      title={assessment.title}
      attemptNo={attempt.attempt_no}
      maxAttempts={assessment.default_attempts ?? 1}
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
      attemptsRemaining={0}
      studentEmail={studentEmail}
    />
  );
}
