'use client';

import { Button } from '@/components/ui/button';
import type { AutosaveStatus } from './use-autosave';

export type AttemptHeaderProps = {
  title: string;
  attemptNo: number;
  maxAttempts: number;
  overallStatus: AutosaveStatus;
  lastSavedAt: Date | null;
  onSubmit: () => void;
  submitDisabled: boolean;
};

function secondsAgo(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
}

function indicatorLabel(s: AutosaveStatus, lastSavedAt: Date | null): string {
  if (s === 'saving') return 'Saving…';
  if (s === 'error') return 'Save failed';
  if (s === 'saved' && lastSavedAt) return `Saved ${secondsAgo(lastSavedAt)}s ago`;
  return 'Saved';
}

export function AttemptHeader(p: AttemptHeaderProps) {
  return (
    <div className="bg-background/95 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold">{p.title}</h1>
        <p className="text-muted-foreground text-xs">
          Attempt {p.attemptNo} of {p.maxAttempts} ·{' '}
          {indicatorLabel(p.overallStatus, p.lastSavedAt)}
        </p>
      </div>
      <Button onClick={p.onSubmit} disabled={p.submitDisabled}>
        Submit attempt
      </Button>
    </div>
  );
}
