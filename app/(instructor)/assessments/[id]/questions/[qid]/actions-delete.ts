'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const Schema = z.object({ qid: z.string().uuid() });

export async function deleteQuestionAction(formData: FormData): Promise<void> {
  const { qid } = Schema.parse({ qid: String(formData.get('qid') ?? '') });
  const supabase = await createServerSupabaseClient();

  const { data: cur } = await supabase
    .from('questions')
    .select('id, assessment_id, position')
    .eq('id', qid)
    .single();
  if (!cur) return;

  await supabase.from('questions').delete().eq('id', qid);

  // Compact positions after the deletion
  const { data: rest } = await supabase
    .from('questions')
    .select('id, position')
    .eq('assessment_id', cur.assessment_id)
    .gt('position', cur.position)
    .order('position');

  for (const r of rest ?? []) {
    await supabase
      .from('questions')
      .update({ position: r.position - 1 })
      .eq('id', r.id);
  }
  revalidatePath(`/assessments/${cur.assessment_id}`);
}
