'use client';

import { useMemo } from 'react';
import { renderQuestion, Markdown, type RenderInput } from '@/lib/rendering';
import { SeedSwitcher } from './SeedSwitcher';
import { RevealPanel } from './RevealPanel';
import type { QuestionDraft } from '@/components/editor/EditorPane';

export function PreviewPane({
  draft, seed, onSeedChange,
}: {
  draft: QuestionDraft;
  seed: number;
  onSeedChange: (next: number) => void;
}) {
  const output = useMemo(() => {
    try {
      const input: RenderInput = {
        question: {
          type: draft.type, body: draft.body, scoring: draft.scoring,
          // The full VariableSpec[] typing is enforced on Save; preview is permissive.
          variables: draft.variables as never,
        },
        seed,
      };
      return renderQuestion(input);
    } catch { return null; }
  }, [draft, seed]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-2 pb-8">
      <SeedSwitcher seed={seed} onSeedChange={onSeedChange} />
      {output ? (
        <>
          <Markdown source={output.rendered_stem} />
          {/* Answer surface — implemented in Task 26 */}
          <p className="text-muted-foreground text-sm">Answer surface — Task 26.</p>
          <RevealPanel output={output} />
        </>
      ) : (
        <p className="text-destructive text-sm">Preview unavailable (invalid draft).</p>
      )}
    </div>
  );
}
