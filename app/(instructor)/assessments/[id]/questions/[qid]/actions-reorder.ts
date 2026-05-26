'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const Schema = z.object({ qid: z.string().uuid() });

async function moveBy(qid: string, direction: -1 | 1): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { data: cur } = await supabase
    .from('questions')
    .select('id, assessment_id, position')
    .eq('id', qid)
    .single();
  if (!cur) return;

  const targetPos = cur.position + direction;
  const { data: neighbor } = await supabase
    .from('questions')
    .select('id, position')
    .eq('assessment_id', cur.assessment_id)
    .eq('position', targetPos)
    .maybeSingle();
  if (!neighbor) return;

  // Two-step swap to avoid UNIQUE(assessment_id, position) collision:
  // 1) park neighbor at -1
  await supabase.from('questions').update({ position: -1 }).eq('id', neighbor.id);
  // 2) move current into neighbor's slot
  await supabase.from('questions').update({ position: targetPos }).eq('id', qid);
  // 3) finalize neighbor into current's old slot
  await supabase.from('questions').update({ position: cur.position }).eq('id', neighbor.id);

  revalidatePath(`/assessments/${cur.assessment_id}`);
}

export async function moveQuestionUpAction(formData: FormData): Promise<void> {
  const { qid } = Schema.parse({ qid: String(formData.get('qid') ?? '') });
  await moveBy(qid, -1);
}

export async function moveQuestionDownAction(formData: FormData): Promise<void> {
  const { qid } = Schema.parse({ qid: String(formData.get('qid') ?? '') });
  await moveBy(qid, +1);
}
