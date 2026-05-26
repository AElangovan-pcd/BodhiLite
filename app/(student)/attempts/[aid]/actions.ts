'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStudent } from '@/lib/auth/require';
import {
  ResponseSchema,
  gradeAnswer,
  computeAttemptSummary,
  type Response,
  type AnswerSnapshot,
  type GradeResult,
} from '@/lib/grading';
import type { Json } from '@/lib/types/database';

export type SaveResult =
  | { ok: true }
  | {
      ok: false;
      error: 'not_yours' | 'already_submitted' | 'invalid_response' | 'unknown';
      message?: string;
    };

export async function saveAnswerAction(input: {
  attemptId: string;
  questionId: string;
  response: Response;
}): Promise<SaveResult> {
  const { user } = await requireStudent();

  const parsed = ResponseSchema.safeParse(input.response);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_response', message: parsed.error.message };
  }

  const supabase = await createServerSupabaseClient();

  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .select('status, student_user_id')
    .eq('id', input.attemptId)
    .maybeSingle();
  if (aErr || !attempt) return { ok: false, error: 'not_yours' };
  if (attempt.student_user_id !== user.id) return { ok: false, error: 'not_yours' };
  if (attempt.status !== 'in_progress') return { ok: false, error: 'already_submitted' };

  const { data: updated, error: uErr } = await supabase
    .from('answers')
    .update({ response: parsed.data as unknown as Json })
    .eq('attempt_id', input.attemptId)
    .eq('question_id', input.questionId)
    .select('id');
  if (uErr) return { ok: false, error: 'unknown', message: uErr.message };
  if (!updated || updated.length === 0) return { ok: false, error: 'not_yours' };

  return { ok: true };
}

export type SubmitResult =
  | {
      ok: true;
      summary: { raw_score: number; max_score: number; percentage: number };
    }
  | {
      ok: false;
      error: 'not_yours' | 'already_submitted' | 'unknown';
      message?: string;
    };

export async function submitAttemptAction(attemptId: string): Promise<SubmitResult> {
  const { user } = await requireStudent();
  const supabase = await createServerSupabaseClient();

  const { data: attempt, error: aErr } = await supabase
    .from('attempts')
    .select('status, student_user_id')
    .eq('id', attemptId)
    .maybeSingle();
  if (aErr || !attempt) return { ok: false, error: 'not_yours' };
  if (attempt.student_user_id !== user.id) return { ok: false, error: 'not_yours' };
  if (attempt.status !== 'in_progress') return { ok: false, error: 'already_submitted' };

  const { data: rows, error: rErr } = await supabase
    .from('answers')
    .select('question_id, rendered_question_snapshot, response')
    .eq('attempt_id', attemptId);
  if (rErr || !rows) {
    return { ok: false, error: 'unknown', message: rErr?.message ?? 'no answers' };
  }

  const grades = rows.map((r) => {
    const snap = r.rendered_question_snapshot as unknown as AnswerSnapshot;
    const resp = (r.response ?? null) as Response | null;
    const result: GradeResult = gradeAnswer(snap, resp);
    return {
      question_id: r.question_id,
      auto_score: result.auto_score,
      score_method: result.score_method,
      result,
    };
  });

  const summary = computeAttemptSummary(grades.map((g) => g.result));

  const { error: sErr } = await supabase.rpc('submit_attempt', {
    p_attempt_id: attemptId,
    p_grades: grades.map((g) => ({
      question_id: g.question_id,
      auto_score: g.auto_score,
      score_method: g.score_method,
    })),
    p_summary: summary,
  });
  if (sErr) return { ok: false, error: 'unknown', message: sErr.message };

  revalidatePath(`/attempts/${attemptId}`);
  revalidatePath(`/attempts/${attemptId}/result`);
  revalidatePath('/');

  return { ok: true, summary };
}
