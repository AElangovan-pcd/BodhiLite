'use client';

import { useMemo } from 'react';
import { renderQuestion, type RenderInput } from '@/lib/rendering';
import { Markdown } from '@/lib/rendering';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { QuestionDraft } from '@/components/editor/EditorPane';

export function PreviewPane({ draft, seed, onSeedChange }: {
  draft: QuestionDraft;
  seed: number;
  onSeedChange: (next: number) => void;
}) {

  const output = useMemo(() => {
    try {
      const input: RenderInput = {
        question: {
          type: draft.type,
          body: draft.body,
          scoring: draft.scoring,
          // The full VariableSpec[] typing is enforced on Save; preview is permissive.
          variables: draft.variables as never,
        },
        seed,
      };
      return renderQuestion(input);
    } catch {
      return null;
    }
  }, [draft, seed]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-2 pb-8">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Preview as</span>
        <Select value={String(seed)} onValueChange={(v) => onSeedChange(Number(v))}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Author (seed=0)</SelectItem>
            <SelectItem value="1">Test student 1</SelectItem>
            <SelectItem value="2">Test student 2</SelectItem>
            <SelectItem value="3">Test student 3</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {output ? (
        <>
          <Markdown source={output.rendered_stem} />
          {/* Answer surfaces come in Task 26 */}
          <p className="text-muted-foreground text-sm">
            Answer surface — implemented in Task 26.
          </p>
          {/* Reveal panel comes in Task 25 */}
          <details className="mt-4 rounded border p-2 text-sm" open>
            <summary className="cursor-pointer font-medium">Reveal</summary>
            <pre className="mt-2 overflow-x-auto text-xs">
{JSON.stringify(
  {
    materialized_values: output.materialized_values,
    grading_target: output.grading_target,
    validation_errors: output.validation_errors,
  },
  null,
  2,
)}
            </pre>
          </details>
        </>
      ) : (
        <p className="text-destructive text-sm">Preview unavailable (invalid draft).</p>
      )}
    </div>
  );
}
