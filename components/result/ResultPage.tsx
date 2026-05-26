'use client';

import Link from 'next/link';
import { Markdown } from '@/lib/rendering';
import { AnswerSurface } from '@/components/preview/answer-surfaces';
import { CorrectAnswerReveal } from './CorrectAnswerReveal';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { AnswerSnapshot, Response } from '@/lib/grading';

export type ResultRow = {
  question_id: string;
  position: number;
  snapshot: AnswerSnapshot;
  response: Response | null;
  auto_score: number | null;
  score_method: string | null;
};

export type ResultPageProps = {
  actor: 'student' | 'instructor';
  title: string;
  attemptNo: number;
  maxAttempts: number;
  submittedAt: string | null;
  summary: { raw_score: number; max_score: number; percentage: number } | null;
  bestRaw: number | null;
  rows: ResultRow[];
  onStartNew?: () => void;
  attemptsRemaining: number;
  studentEmail?: string;
};

function badge(
  auto: number | null,
  scoreMethod: string | null,
): { label: string; tone: 'ok' | 'warn' | 'err' } {
  if (auto == null) return { label: 'Not graded', tone: 'warn' };
  if (scoreMethod === 'auto_error')
    return { label: 'Could not auto-grade', tone: 'err' };
  if (auto === 1) return { label: `Correct (${auto.toFixed(2)}/1)`, tone: 'ok' };
  if (auto === 0) return { label: `Incorrect (0/1)`, tone: 'err' };
  return { label: `Partial credit (${auto.toFixed(2)}/1)`, tone: 'warn' };
}

export function ResultPage(p: ResultPageProps) {
  return (
    <main className="mx-auto max-w-3xl p-6 pb-24">
      <header className="mb-6">
        <p className="text-muted-foreground text-xs">
          <Link href="/" className="underline">
            ← Home
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{p.title}</h1>
        <p className="text-muted-foreground text-sm">
          {p.actor === 'instructor' && p.studentEmail
            ? `Attempt ${p.attemptNo} by ${p.studentEmail}`
            : `Attempt ${p.attemptNo} of ${p.maxAttempts}`}
          {p.submittedAt && ` · submitted ${new Date(p.submittedAt).toLocaleString()}`}
        </p>
      </header>

      {p.summary && (
        <section className="bg-card mb-6 rounded-lg border p-4">
          <p className="text-3xl font-bold">
            {p.summary.raw_score} / {p.summary.max_score}
          </p>
          <p className="text-muted-foreground text-sm">
            {p.summary.percentage.toFixed(2)}%
          </p>
          {p.bestRaw != null && p.summary.raw_score < p.bestRaw && (
            <p className="text-muted-foreground mt-2 text-xs">
              Highest score on this assessment: {p.bestRaw}
            </p>
          )}
          {p.actor === 'student' && p.attemptsRemaining > 0 && p.onStartNew && (
            <button
              onClick={p.onStartNew}
              className="bg-primary text-primary-foreground mt-3 rounded px-4 py-2 text-sm font-medium"
            >
              Start new attempt ({p.attemptsRemaining} remaining)
            </button>
          )}
          {p.actor === 'student' && p.attemptsRemaining === 0 && (
            <p className="text-muted-foreground mt-3 text-xs">No attempts remaining.</p>
          )}
        </section>
      )}

      <div className="flex flex-col gap-4">
        {p.rows.map((row) => {
          const b = badge(row.auto_score, row.score_method);
          return (
            <Card key={row.question_id} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-semibold">Q{row.position + 1}</h2>
                <Badge variant="secondary">{row.snapshot.question_type}</Badge>
                <Badge
                  variant={
                    b.tone === 'ok'
                      ? 'default'
                      : b.tone === 'err'
                        ? 'destructive'
                        : 'outline'
                  }
                >
                  {b.label}
                </Badge>
              </div>
              <div className="prose mb-3 max-w-none">
                <Markdown source={row.snapshot.render.rendered_stem} />
              </div>
              <div className="mb-3">
                <p className="text-muted-foreground mb-1 text-xs font-medium">
                  Your response
                </p>
                <AnswerSurface
                  body={row.snapshot.render.rendered_body}
                  value={row.response}
                  onChange={() => {}}
                  disabled
                />
              </div>
              <div className="bg-muted rounded p-2">
                <CorrectAnswerReveal snapshot={row.snapshot} response={row.response} />
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
