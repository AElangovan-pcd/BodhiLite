'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { AttemptHeader } from '@/components/attempt/AttemptHeader';
import { QuestionCard } from '@/components/attempt/QuestionCard';
import { SubmitDialog } from '@/components/attempt/SubmitDialog';
import { useAutosave, type AutosaveStatus } from '@/components/attempt/use-autosave';
import { saveAnswerAction, submitAttemptAction } from './actions';
import { isResponseEmpty, type AnswerSnapshot, type Response } from '@/lib/grading';

type Card = {
  position: number;
  questionId: string;
  snapshot: AnswerSnapshot;
  initialResponse: Response | null;
};

type Props = {
  attemptId: string;
  title: string;
  attemptNo: number;
  maxAttempts: number;
  cards: Card[];
};

export function AttemptClient({ attemptId, title, attemptNo, maxAttempts, cards }: Props) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, Response | null>>(() => {
    const init: Record<string, Response | null> = {};
    for (const c of cards) init[c.questionId] = c.initialResponse;
    return init;
  });
  const [statuses, setStatuses] = useState<Record<string, AutosaveStatus>>({});
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onChange = useCallback((qid: string, next: Response) => {
    setResponses((prev) => ({ ...prev, [qid]: next }));
  }, []);

  const setCardStatus = useCallback((qid: string, s: AutosaveStatus) => {
    setStatuses((prev) => (prev[qid] === s ? prev : { ...prev, [qid]: s }));
  }, []);

  const overallStatus: AutosaveStatus = useMemo(() => {
    const vals = Object.values(statuses);
    if (vals.includes('error')) return 'error';
    if (vals.includes('saving')) return 'saving';
    if (vals.includes('saved')) return 'saved';
    return 'idle';
  }, [statuses]);

  const unanswered = cards.filter((c) => isResponseEmpty(responses[c.questionId] ?? null));

  async function doSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitAttemptAction(attemptId);
    if (result.ok) {
      router.push(`/attempts/${attemptId}/result` as Route);
    } else {
      setSubmitError(result.message ?? result.error);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl pb-24">
      <AttemptHeader
        title={title}
        attemptNo={attemptNo}
        maxAttempts={maxAttempts}
        overallStatus={overallStatus}
        lastSavedAt={lastSavedAt}
        onSubmit={() => setDialogOpen(true)}
        submitDisabled={overallStatus === 'saving' || submitting}
      />
      {submitError && (
        <div role="alert" className="mx-4 mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm">
          Submit failed: {submitError}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-4 px-4">
        {cards.map((c) => (
          <CardWithAutosave
            key={c.questionId}
            card={c}
            attemptId={attemptId}
            response={responses[c.questionId] ?? null}
            onChange={onChange}
            setCardStatus={setCardStatus}
            setLastSavedAt={setLastSavedAt}
          />
        ))}
      </div>
      <div className="text-muted-foreground mx-4 mt-6 flex items-center justify-between text-sm">
        <span>
          {cards.length - unanswered.length} of {cards.length} answered
        </span>
        <Link href="/" className="underline">
          Save and continue later
        </Link>
      </div>
      <SubmitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        unansweredCount={unanswered.length}
        unansweredLabels={unanswered.map((c) => `Q${c.position + 1}`)}
        onConfirm={doSubmit}
        submitting={submitting}
      />
    </main>
  );
}

function CardWithAutosave({
  card,
  attemptId,
  response,
  onChange,
  setCardStatus,
  setLastSavedAt,
}: {
  card: Card;
  attemptId: string;
  response: Response | null;
  onChange: (qid: string, r: Response) => void;
  setCardStatus: (qid: string, s: AutosaveStatus) => void;
  setLastSavedAt: (when: Date | null) => void;
}) {
  const autosave = useAutosave({
    attemptId,
    questionId: card.questionId,
    response,
    onSave: saveAnswerAction,
  });

  useEffect(() => {
    setCardStatus(card.questionId, autosave.status);
    if (autosave.lastSavedAt) setLastSavedAt(autosave.lastSavedAt);
  }, [autosave.status, autosave.lastSavedAt, card.questionId, setCardStatus, setLastSavedAt]);

  const handleChange = useCallback(
    (r: Response) => onChange(card.questionId, r),
    [onChange, card.questionId],
  );

  return (
    <QuestionCard
      position={card.position}
      snapshot={card.snapshot}
      response={response}
      onChange={handleChange}
      anchor={`q-${card.questionId}`}
    />
  );
}
