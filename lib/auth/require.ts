import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

export type AuthedUser = { user: User; role: 'student' | 'instructor' };

export async function requireStudent(): Promise<AuthedUser> {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/sign-in');

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', auth.user.id)
    .single();

  if (error || !data) redirect('/sign-in');
  if (data.role !== 'student' && data.role !== 'instructor') notFound();

  return { user: auth.user, role: data.role };
}

export async function requireInstructor(): Promise<{ user: User }> {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/sign-in');

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', auth.user.id)
    .single();

  if (error || !data) notFound();
  if (data.role !== 'instructor') notFound();

  return { user: auth.user };
}
