import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireInstructor } from '@/lib/auth/require';
import { GradebookTable, type GradebookRow } from '@/components/gradebook/GradebookTable';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; dir?: string }>;
};

const SORT_KEYS = ['student_email', 'attempts_used', 'best_pct', 'last_submitted_at'] as const;
type SortKey = (typeof SORT_KEYS)[number];

export default async function GradebookPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  await requireInstructor();
  const supabase = await createServerSupabaseClient();

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, title, default_attempts')
    .eq('id', id)
    .maybeSingle();
  if (!assessment) notFound();

  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sp.sort ?? '')
    ? (sp.sort as SortKey)
    : 'last_submitted_at';
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc';

  const { data: rows } = await supabase
    .from('gradebook_rows')
    .select('*')
    .eq('assessment_id', id)
    .order(sort, { ascending: dir === 'asc', nullsFirst: dir === 'asc' });

  const { count: inProgress } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('assessment_id', id)
    .eq('status', 'in_progress');

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-4">
        <p className="text-muted-foreground text-xs">
          <Link href={`/assessments/${id}` as Route} className="underline">
            ← {assessment.title}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Attempts</h1>
        {(inProgress ?? 0) > 0 && (
          <p className="text-muted-foreground mt-1 text-xs">{inProgress} in progress</p>
        )}
      </header>
      <GradebookTable
        assessmentId={id}
        rows={(rows ?? []) as GradebookRow[]}
        maxAttempts={assessment.default_attempts ?? 1}
        sort={sort}
        dir={dir}
      />
    </main>
  );
}
