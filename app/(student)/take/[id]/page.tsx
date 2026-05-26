import { startAttemptAction } from './actions';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';

type Props = { params: Promise<{ id: string }> };

export default async function TakeEntryPage({ params }: Props) {
  const { id } = await params;
  const result = await startAttemptAction(id);

  if (result.ok) {
    redirect(`/attempts/${result.attemptId}` as Route);
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Can&apos;t start attempt</h1>
      <p className="text-muted-foreground mt-2">
        {result.error === 'not_published' && 'This assessment is not available.'}
        {result.error === 'closed' && 'This assessment is not open at this time.'}
        {result.error === 'no_attempts_remaining' && 'You have used all available attempts.'}
        {result.error === 'unknown' && (result.message ?? 'An unexpected error occurred.')}
      </p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        ← Back to home
      </Link>
    </main>
  );
}
