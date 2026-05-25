'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { EditorPane, type QuestionDraft } from '@/components/editor/EditorPane';
import { PreviewPane } from '@/components/preview/PreviewPane';
import { renderQuestion } from '@/lib/rendering';
import type { MaterializedValues } from '@/lib/materializer/types';
import { saveQuestionAction } from './actions';

export function QuestionEditorClient({
  assessmentId,
  questionId,
  position,
  totalQuestions,
  initial,
}: {
  assessmentId: string;
  questionId: string;
  position: number;
  totalQuestions: number;
  initial: QuestionDraft;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [liveDraft, setLiveDraft] = useState<QuestionDraft>(initial);
  const [seed, setSeed] = useState(0);

  const materialized = useMemo<MaterializedValues>(() => {
    try {
      return renderQuestion({
        question: {
          type: liveDraft.type,
          body: liveDraft.body,
          scoring: liveDraft.scoring,
          variables: liveDraft.variables as never,
        },
        seed,
      }).materialized_values;
    } catch {
      return {};
    }
  }, [liveDraft, seed]);

  async function doSave(draft: QuestionDraft, andNext: boolean): Promise<void> {
    setSaving(true);
    setErrors([]);
    try {
      const fd = new FormData();
      fd.set('payload', JSON.stringify(draft));
      const result = await saveQuestionAction(assessmentId, questionId, fd);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      if (!andNext) router.refresh();
    } catch (e) {
      setErrors([`Save failed: ${(e as Error).message}`]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex h-svh flex-col">
      <header className="border-b px-4 py-2">
        <Link
          href={`/assessments/${assessmentId}` as Route}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Assessment
        </Link>
      </header>
      {errors.length > 0 && (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive mx-2 my-2 rounded border p-2 text-sm"
        >
          <ul>
            {errors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section aria-label="Editor" className="overflow-hidden border-r">
          <EditorPane
            position={position}
            totalQuestions={totalQuestions}
            initial={initial}
            saving={saving}
            onChange={setLiveDraft}
            onSave={(d) => doSave(d, false)}
            onSaveAndNext={(d) => doSave(d, true)}
            materializedScope={materialized}
          />
        </section>
        <section aria-label="Preview">
          <PreviewPane draft={liveDraft} seed={seed} onSeedChange={setSeed} />
        </section>
      </div>
    </main>
  );
}
