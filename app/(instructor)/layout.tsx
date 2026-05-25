import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in' as Route);

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();

  if (!profile || profile.role !== 'instructor') {
    notFound();
  }

  return <>{children}</>;
}
