import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { SettingsForm } from '@/components/assessments/SettingsForm';
import { QuestionsTable } from '@/components/assessments/QuestionsTable';
import { updateSettingsAction } from './edit-settings/actions';
import { moveQuestionUpAction, moveQuestionDownAction } from './questions/[qid]/actions-reorder';
import { deleteQuestionAction } from './questions/[qid]/actions-delete';

export const dynamic = 'force-dynamic';

export default async function AssessmentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: a } = await supabase.from('assessments').select('*').eq('id', id).single();
  if (!a) notFound();

  const { data: questions } = await supabase
    .from('questions')
    .select('id, position, type, body')
    .eq('assessment_id', id)
    .order('position');

  const qrows = (questions ?? []).map((q) => ({
    id: q.id,
    position: q.position,
    type: q.type,
    stem_preview: String((q.body as { stem?: string })?.stem ?? '').slice(0, 80),
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href={'/assessments' as Route}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Assessments
      </Link>

      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">{a.title}</h1>
        <Link href={`/assessments/${id}/attempts` as Route} className="text-sm underline">
          View attempts →
        </Link>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Settings</h2>
        <SettingsForm
          assessment={{
            id: a.id,
            title: a.title,
            slug: a.slug,
            status: a.status,
            assessment_type: a.assessment_type,
            time_limit_seconds: a.time_limit_seconds,
            default_attempts: a.default_attempts,
            randomize_questions: a.randomize_questions,
            randomize_choices: a.randomize_choices,
            opens_at: a.opens_at,
            closes_at: a.closes_at,
          }}
          action={updateSettingsAction}
        />
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Questions</h2>
          <Button asChild>
            <Link href={`/assessments/${id}/questions/new` as Route}>+ Add question</Link>
          </Button>
        </div>
        <QuestionsTable
          assessmentId={id}
          questions={qrows}
          onMoveUp={moveQuestionUpAction}
          onMoveDown={moveQuestionDownAction}
          onDelete={deleteQuestionAction}
        />
      </section>
    </main>
  );
}
