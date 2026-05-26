'use client';

import { useEffect, useRef, useState } from 'react';
import type { Response } from '@/lib/grading';
import type { SaveResult } from '@/app/(student)/attempts/[aid]/actions';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type UseAutosaveInput = {
  attemptId: string;
  questionId: string;
  response: Response | null;
  onSave: (input: {
    attemptId: string;
    questionId: string;
    response: Response;
  }) => Promise<SaveResult>;
  debounceMs?: number;
};

export function useAutosave(input: UseAutosaveInput) {
  const { attemptId, questionId, response, onSave, debounceMs = 500 } = input;
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const inflightRef = useRef<Promise<SaveResult> | null>(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (response == null) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setStatus('saving');
      const p = onSave({ attemptId, questionId, response });
      inflightRef.current = p;
      const result = await p;
      if (inflightRef.current !== p) return;
      if (result.ok) {
        setStatus('saved');
        setLastSavedAt(new Date());
      } else {
        setStatus('error');
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [response, attemptId, questionId, onSave, debounceMs]);

  function retry() {
    if (response) {
      setStatus('saving');
      onSave({ attemptId, questionId, response }).then((r) => {
        setStatus(r.ok ? 'saved' : 'error');
        if (r.ok) setLastSavedAt(new Date());
      });
    }
  }

  return { status, lastSavedAt, retry };
}
