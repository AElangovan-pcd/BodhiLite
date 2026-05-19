import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAssessmentAction } from './actions';

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <Link href={'/assessments' as Route} className="text-muted-foreground text-sm hover:underline">
        ← Assessments
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New assessment</h1>

      {sp.error && (
        <div
          role="alert"
          className="my-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900"
        >
          {sp.error}
        </div>
      )}

      <form action={createAssessmentAction} className="mt-6 flex flex-col gap-3">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={200} />

        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" required pattern="^[a-z0-9-]+$" />

        <Label htmlFor="assessment_type">Type</Label>
        <select
          id="assessment_type"
          name="assessment_type"
          defaultValue="quiz"
          className="border-input bg-background rounded-md border px-3 py-1 text-sm"
        >
          <option value="quiz">Quiz</option>
          <option value="exam">Exam</option>
        </select>

        <Label htmlFor="time_limit_seconds">Time limit (seconds, exam only)</Label>
        <Input id="time_limit_seconds" name="time_limit_seconds" type="number" min={1} />

        <Button type="submit">Create</Button>
      </form>
    </main>
  );
}
