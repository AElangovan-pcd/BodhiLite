'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StemField } from './StemField';
import { ActionBar } from './ActionBar';
import type { QuestionType } from '@/lib/schemas';
import {
  McScoringForm, MaScoringForm, TfScoringForm,
  NumericScoringForm, ShortAnswerScoringForm, FillInScoringForm,
} from './scoring-forms';

function Scoring({ type, body, scoring, onChange }: {
  type: QuestionType;
  body: Record<string, unknown>;
  scoring: Record<string, unknown>;
  onChange: (body: Record<string, unknown>, scoring: Record<string, unknown>) => void;
}) {
  switch (type) {
    case 'mc': return <McScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
    case 'ma': return <MaScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
    case 'tf': return <TfScoringForm body={body} scoring={scoring as never} onChange={onChange} />;
    case 'numeric': return <NumericScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
    case 'short_answer': return <ShortAnswerScoringForm body={body} scoring={scoring as never} onChange={onChange} />;
    case 'fill_in': return <FillInScoringForm body={body as never} scoring={scoring as never} onChange={onChange} />;
  }
}

export type QuestionDraft = {
  type: QuestionType;
  body: Record<string, unknown>;
  scoring: Record<string, unknown>;
  variables: { name: string; type: string; position: number; spec: Record<string, unknown> }[];
};

export function EditorPane({
  position,
  totalQuestions,
  initial,
  saving,
  onSave,
  onSaveAndNext,
  onChange,
}: {
  position: number;
  totalQuestions: number;
  initial: QuestionDraft;
  saving: boolean;
  onSave: (q: QuestionDraft) => Promise<void>;
  onSaveAndNext: (q: QuestionDraft) => Promise<void>;
  onChange: (q: QuestionDraft) => void;
}) {
  const [draft, setDraft] = useState<QuestionDraft>(initial);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    onChange(draft);
  }, [draft, onChange]);

  function patch(p: Partial<QuestionDraft>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  }

  // beforeunload warning when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-2 pb-16">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Q{position} / {totalQuestions}</span>
        <Badge variant="outline">{draft.type}</Badge>
      </div>

      <StemField
        value={String(draft.body['stem'] ?? '')}
        onChange={(stem) => patch({ body: { ...draft.body, stem } })}
      />

      <Separator />

      <Scoring type={draft.type} body={draft.body} scoring={draft.scoring}
               onChange={(body, scoring) => patch({ body: { ...draft.body, ...body }, scoring })} />

      <Separator />

      {/* Variables come in Tasks 23-25 */}
      <p className="text-muted-foreground text-sm">Variables — implemented in Tasks 23-25.</p>

      <ActionBar
        saving={saving}
        dirty={dirty}
        onSave={async () => { await onSave(draft); setDirty(false); }}
        onSaveAndNext={async () => { await onSaveAndNext(draft); setDirty(false); }}
        onDiscard={() => { setDraft(initial); setDirty(false); }}
        nextDisabled={position >= totalQuestions}
      />
    </div>
  );
}
