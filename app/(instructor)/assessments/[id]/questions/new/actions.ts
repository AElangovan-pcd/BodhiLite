'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import type { Json } from '@/lib/types/database';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PathSchema = z.object({
  assessmentId: z.string().uuid(),
  type: z.enum(['mc', 'ma', 'tf', 'numeric', 'short_answer', 'fill_in']),
});

// Default body/scoring shapes by type — minimal so the form has something to render
const DEFAULTS: Record<string, { body: Json; scoring: Json }> = {
  mc: {
    body: {
      stem: '',
      choices: [
        { id: 'a', label: '' },
        { id: 'b', label: '' },
      ],
    },
    scoring: { correct_id: 'a' },
  },
  ma: {
    body: {
      stem: '',
      choices: [
        { id: 'a', label: '' },
        { id: 'b', label: '' },
      ],
    },
    scoring: { correct_ids: [] },
  },
  tf: { body: { stem: '' }, scoring: { correct: true } },
  numeric: { body: { stem: '' }, scoring: { formula: '0', tolerance: 0 } },
  short_answer: { body: { stem: '' }, scoring: { pattern: '.*', case_insensitive: true } },
  fill_in: { body: { stem: '', blanks: [] }, scoring: { targets: [] } },
};

export async function createQuestionAction(
  assessmentId: string,
  formData: FormData,
): Promise<void> {
  const parsed = PathSchema.safeParse({
    assessmentId,
    type: String(formData.get('type') ?? ''),
  });
  if (!parsed.success) redirect(`/assessments/${assessmentId}` as Route);

  const supabase = await createServerSupabaseClient();

  const { data: maxRow } = await supabase
    .from('questions')
    .select('position')
    .eq('assessment_id', parsed.data.assessmentId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position ?? 0) + 1;

  const defaults = DEFAULTS[parsed.data.type]!;
  const { data, error } = await supabase
    .from('questions')
    .insert({
      assessment_id: parsed.data.assessmentId,
      position: nextPos,
      type: parsed.data.type,
      body: defaults.body,
      scoring: defaults.scoring,
    })
    .select('id')
    .single();

  if (error || !data) {
    redirect(
      `/assessments/${assessmentId}?error=${encodeURIComponent(error?.message ?? '')}` as Route,
    );
  }
  redirect(`/assessments/${assessmentId}/questions/${data.id}` as Route);
}
