import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'best';
  bestRaw?: number;
  bestMax?: number;
  attemptId?: string;
};

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
  const role = profile?.role ?? 'student';

  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, title, status, opens_at, closes_at')
    .eq('status', 'published')
    .order('opens_at', { ascending: false, nullsFirst: false });

  const rows: Row[] = [];
  for (const a of assessments ?? []) {
    const { data: inProg } = await supabase
      .from('attempts')
      .select('id')
      .eq('assessment_id', a.id)
      .eq('student_user_id', user.id)
      .eq('status', 'in_progress')
      .maybeSingle();
    if (inProg) {
      rows.push({
        id: a.id,
        title: a.title,
        status: 'in_progress',
        attemptId: inProg.id,
      });
      continue;
    }

    const { data: subs } = await supabase
      .from('attempts')
      .select('summary')
      .eq('assessment_id', a.id)
      .eq('student_user_id', user.id)
      .eq('status', 'submitted');
    if (subs && subs.length > 0) {
      let bestRaw: number | null = null;
      let bestMax: number | null = null;
      for (const s of subs) {
        const sum = s.summary as { raw_score?: number; max_score?: number } | null;
        if (sum?.raw_score != null && (bestRaw == null || sum.raw_score > bestRaw)) {
          bestRaw = sum.raw_score;
          bestMax = sum.max_score ?? null;
        }
      }
      rows.push({
        id: a.id,
        title: a.title,
        status: 'best',
        bestRaw: bestRaw ?? 0,
        bestMax: bestMax ?? 0,
      });
    } else {
      rows.push({ id: a.id, title: a.title, status: 'not_started' });
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">BodhiLite</h1>
          <p className="text-muted-foreground mt-2 text-sm">Signed in as {user.email}.</p>
        </div>
        <form action="/sign-out" method="post">
          <button
            type="submit"
            className="hover:bg-muted rounded border px-3 py-1.5 text-sm"
          >
            Sign out
          </button>
        </form>
      </header>

      {role === 'instructor' && (
        <section className="bg-card mb-8 rounded border p-4">
          <h2 className="mb-2 text-lg font-semibold">Instructor</h2>
          <Link href={'/assessments' as Route} className="text-sm underline">
            Manage assessments →
          </Link>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Your assessments</h2>
        {rows.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No assessments available right now.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded border p-3"
            >
              <span className="font-medium">{r.title}</span>
              <span className="flex items-center gap-3 text-sm">
                {r.status === 'not_started' && (
                  <span className="text-muted-foreground">Not yet attempted</span>
                )}
                {r.status === 'in_progress' && (
                  <span className="text-amber-700">In progress</span>
                )}
                {r.status === 'best' && (
                  <span>
                    Best: {r.bestRaw}/{r.bestMax}
                  </span>
                )}
                <Link
                  href={`/take/${r.id}` as Route}
                  className="bg-primary text-primary-foreground rounded px-3 py-1"
                >
                  {r.status === 'in_progress'
                    ? 'Resume'
                    : r.status === 'best'
                      ? 'Retake'
                      : 'Start'}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
