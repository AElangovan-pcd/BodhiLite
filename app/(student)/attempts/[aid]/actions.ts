'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStudent } from '@/lib/auth/require';
import { ResponseSchema, type Response } from '@/lib/grading';
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
