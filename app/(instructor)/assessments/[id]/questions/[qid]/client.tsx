'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { EditorPane, type QuestionDraft } from '@/components/editor/EditorPane';
import { PreviewPane } from '@/components/preview/PreviewPane';
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
  const [liveDraft, setLiveDraft] = useState<QuestionDraft>(initial);

  async function doSave(draft: QuestionDraft, andNext: boolean): Promise<void> {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set('payload', JSON.stringify(draft));
      await saveQuestionAction(assessmentId, questionId, fd);
      if (!andNext) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex h-svh flex-col">
      <header className="border-b px-4 py-2">
        <Link href={`/assessments/${assessmentId}` as Route}
              className="text-muted-foreground text-sm hover:underline">
          ← Assessment
        </Link>
      </header>
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section aria-label="Editor" className="border-r overflow-hidden">
          <EditorPane
            position={position}
            totalQuestions={totalQuestions}
            initial={initial}
            saving={saving}
            onChange={setLiveDraft}
            onSave={(d) => doSave(d, false)}
            onSaveAndNext={(d) => doSave(d, true)}
          />
        </section>
        <section aria-label="Preview">
          <PreviewPane draft={liveDraft} />
        </section>
      </div>
    </main>
  );
}
