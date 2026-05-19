import Link from 'next/link';
import type { Route } from 'next';
import { TypePicker } from '@/components/assessments/TypePicker';
import { createQuestionAction } from './actions';

export default async function NewQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const boundAction = createQuestionAction.bind(null, id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link href={`/assessments/${id}` as Route}
            className="text-muted-foreground text-sm hover:underline">
        ← Assessment
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New question</h1>
      <p className="text-muted-foreground mb-6 mt-1 text-sm">
        Pick a type. The question type can&apos;t change later — delete + recreate if you need to switch.
      </p>
      <TypePicker action={boundAction} />
    </main>
  );
}
