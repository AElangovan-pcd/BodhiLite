'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const SettingsSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(['draft', 'published', 'archived']),
  default_attempts: z.number().int().positive(),
  time_limit_seconds: z.number().int().positive().nullable(),
  randomize_questions: z.boolean(),
  randomize_choices: z.boolean(),
});

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const raw = {
    id: String(formData.get('id') ?? ''),
    title: String(formData.get('title') ?? '').trim(),
    slug: String(formData.get('slug') ?? '').trim().toLowerCase(),
    status: String(formData.get('status') ?? 'draft'),
    default_attempts: Number(formData.get('default_attempts') ?? 3),
    time_limit_seconds: formData.get('time_limit_seconds')
      ? Number(formData.get('time_limit_seconds'))
      : null,
    randomize_questions: formData.get('randomize_questions') === 'on',
    randomize_choices: formData.get('randomize_choices') === 'on',
  };

  const parsed = SettingsSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/assessments/${raw.id}?error=${encodeURIComponent('Invalid settings')}` as Route);
  }

  const supabase = await createServerSupabaseClient();
  const { id, ...patch } = parsed.data;
  const { error } = await supabase.from('assessments').update(patch).eq('id', id);
  if (error) {
    redirect(`/assessments/${id}?error=${encodeURIComponent(error.message)}` as Route);
  }

  revalidatePath(`/assessments/${id}`);
  redirect(`/assessments/${id}` as Route);
}
