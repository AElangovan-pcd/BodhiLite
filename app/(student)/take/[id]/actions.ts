'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStudent } from '@/lib/auth/require';
import { buildSnapshot } from '@/lib/grading';
import { stableSeed } from '@/lib/materializer';
import type { QuestionType } from '@/lib/schemas';

const RENDERABLE_TYPES: readonly QuestionType[] = [
  'mc',
  'ma',
  'tf',
  'numeric',
  'short_answer',
  'fill_in',
];

export type StartResult =
  | { ok: true; attemptId: string }
  | {
      ok: false;
      error: 'not_published' | 'closed' | 'no_attempts_remaining' | 'unknown';
      message?: string;
    };

export async function startAttemptAction(assessmentId: string): Promise<StartResult> {
  const { user } = await requireStudent();
  const supabase = await createServerSupabaseClient();

  const { data: assessment, error: aErr } = await supabase
    .from('assessments')
    .select('id, status, default_attempts, opens_at, closes_at')
    .eq('id', assessmentId)
    .maybeSingle();
  if (aErr || !assessment) return { ok: false, error: 'not_published' };
  if (assessment.status !== 'published') return { ok: false, error: 'not_published' };

  const now = new Date();
  if (assessment.opens_at && new Date(assessment.opens_at) > now) {
    return { ok: false, error: 'closed' };
  }
  if (assessment.closes_at && new Date(assessment.closes_at) < now) {
    return { ok: false, error: 'closed' };
  }

  const { data: inProg } = await supabase
    .from('attempts')
    .select('id')
    .eq('assessment_id', assessmentId)
    .eq('student_user_id', user.id)
    .eq('status', 'in_progress')
    .maybeSingle();
  if (inProg) return { ok: true, attemptId: inProg.id };

  const { data: override } = await supabase
    .from('assessment_overrides')
    .select('extra_attempts')
    .eq('assessment_id', assessmentId)
    .eq('student_user_id', user.id)
    .maybeSingle();
  const maxAttempts = (assessment.default_attempts ?? 1) + (override?.extra_attempts ?? 0);

  const { count: submittedCount, error: cErr } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId)
    .eq('student_user_id', user.id)
    .eq('status', 'submitted');
  if (cErr) return { ok: false, error: 'unknown', message: cErr.message };
  const attemptNo = (submittedCount ?? 0) + 1;
  if (attemptNo > maxAttempts) return { ok: false, error: 'no_attempts_remaining' };

  const seed = await stableSeed({
    student_id: user.id,
    assessment_id: assessmentId,
    attempt_no: attemptNo,
  });

  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('id, type, body, scoring, position, question_variables(id, name, type, spec, position)')
    .eq('assessment_id', assessmentId)
    .order('position', { ascending: true });
  if (qErr || !questions) {
    return { ok: false, error: 'unknown', message: qErr?.message ?? 'no questions' };
  }

  const renderable = questions.filter((q): q is typeof q & { type: QuestionType } =>
    RENDERABLE_TYPES.includes(q.type as QuestionType),
  );

  const snapshots = renderable.map((q) => ({
    question_id: q.id,
    snapshot: buildSnapshot({
      question: {
        id: q.id,
        type: q.type,
        body: q.body as Record<string, unknown>,
        scoring: q.scoring as Record<string, unknown>,
        variables: (q.question_variables ?? []).map((v) => ({
          name: v.name,
          type: v.type,
          position: v.position,
          spec: v.spec as Record<string, unknown>,
        })) as never,
      },
      seed,
    }),
  }));

  const { data: newId, error: sErr } = await supabase.rpc('start_attempt', {
    p_assessment_id: assessmentId,
    p_student_user_id: user.id,
    p_attempt_no: attemptNo,
    p_seed: seed,
    p_snapshots: snapshots,
  });
  if (sErr || !newId) {
    return { ok: false, error: 'unknown', message: sErr?.message ?? 'rpc failed' };
  }

  return { ok: true, attemptId: newId as string };
}

export async function startOrResumeAndRedirect(assessmentId: string): Promise<never> {
  const result = await startAttemptAction(assessmentId);
  if (result.ok) {
    redirect(`/attempts/${result.attemptId}` as Route);
  }
  throw new Error(`start_failed:${result.error}`);
}
