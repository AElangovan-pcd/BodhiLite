import Link from 'next/link';
import type { Route } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { AssessmentCard } from '@/components/assessments/AssessmentCard';

export const dynamic = 'force-dynamic';

export default async function AssessmentsListPage() {
  const supabase = await createServerSupabaseClient();
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, title, slug, status, assessment_type, updated_at, questions(id)')
    .order('updated_at', { ascending: false });

  const rows = (assessments ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    status: a.status,
    assessment_type: a.assessment_type,
    questionCount: Array.isArray(a.questions) ? a.questions.length : 0,
    updated_at: a.updated_at,
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Assessments</h1>
        <Button asChild>
          <Link href={'/assessments/new' as Route}>+ New assessment</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">No assessments yet. Create your first one.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => <AssessmentCard key={r.id} {...r} />)}
        </div>
      )}
    </main>
  );
}
