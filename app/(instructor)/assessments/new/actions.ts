'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  assessment_type: z.enum(['quiz', 'exam']),
  time_limit_seconds: z.number().int().positive().optional(),
  default_attempts: z.number().int().positive().default(3),
});

export async function createAssessmentAction(formData: FormData): Promise<void> {
  const raw = {
    title: String(formData.get('title') ?? '').trim(),
    slug: String(formData.get('slug') ?? '')
      .trim()
      .toLowerCase(),
    assessment_type: String(formData.get('assessment_type') ?? 'quiz'),
    time_limit_seconds: formData.get('time_limit_seconds')
      ? Number(formData.get('time_limit_seconds'))
      : undefined,
    default_attempts: 3,
  };

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ');
    redirect(`/assessments/new?error=${encodeURIComponent(msg)}` as Route);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in' as Route);

  const { data, error } = await supabase
    .from('assessments')
    .insert({
      owner_user_id: user.id,
      title: parsed.data.title,
      slug: parsed.data.slug,
      assessment_type: parsed.data.assessment_type,
      ...(parsed.data.time_limit_seconds != null
        ? { time_limit_seconds: parsed.data.time_limit_seconds }
        : {}),
      default_attempts: parsed.data.default_attempts,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !data) {
    redirect(`/assessments/new?error=${encodeURIComponent(error?.message ?? 'unknown')}` as Route);
  }
  redirect(`/assessments/${data.id}` as Route);
}
