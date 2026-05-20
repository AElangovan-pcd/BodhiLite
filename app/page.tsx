import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in' as Route);

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">BodhiLite</h1>
      <p className="text-muted-foreground mt-2">Signed in as {user.email}.</p>

      {profile?.role === 'instructor' && (
        <p className="mt-6">
          <Link href={'/assessments' as Route} className="underline">
            Go to your assessments →
          </Link>
        </p>
      )}

      <form action="/sign-out" method="post" className="mt-6">
        <button type="submit" className="hover:bg-muted rounded border px-3 py-1.5 text-sm">
          Sign out
        </button>
      </form>
    </main>
  );
}
