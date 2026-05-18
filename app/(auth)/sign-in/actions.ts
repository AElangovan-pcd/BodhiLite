'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
// Next.js typedRoutes brands route strings; query-string variants require this cast.
import type { Route } from 'next';

export async function sendMagicLinkAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email) redirect('/sign-in?error=missing-email' as Route);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/callback`,
    },
  });

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}` as Route);
  }
  redirect('/sign-in?sent=1' as Route);
}
