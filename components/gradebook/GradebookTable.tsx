import Link from 'next/link';
import type { Route } from 'next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type GradebookRow = {
  assessment_id: string;
  student_user_id: string;
  student_email: string;
  attempts_used: number;
  best_raw: number | null;
  best_max: number | null;
  best_pct: number | null;
  last_submitted_at: string | null;
  best_attempt_id: string | null;
};

type SortDir = 'asc' | 'desc';
type SortKey = 'student_email' | 'attempts_used' | 'best_pct' | 'last_submitted_at';

export function GradebookTable({
  assessmentId,
  rows,
  maxAttempts,
  sort,
  dir,
}: {
  assessmentId: string;
  rows: GradebookRow[];
  maxAttempts: number;
  sort: SortKey;
  dir: SortDir;
}) {
  function headLink(k: SortKey, label: string) {
    const nextDir: SortDir = sort === k && dir === 'desc' ? 'asc' : 'desc';
    return (
      <Link
        href={`/assessments/${assessmentId}/attempts?sort=${k}&dir=${nextDir}` as Route}
        className="underline"
      >
        {label} {sort === k ? (dir === 'desc' ? '↓' : '↑') : ''}
      </Link>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{headLink('student_email', 'Student')}</TableHead>
          <TableHead>{headLink('attempts_used', 'Attempts')}</TableHead>
          <TableHead>Best score</TableHead>
          <TableHead>{headLink('best_pct', 'Best %')}</TableHead>
          <TableHead>{headLink('last_submitted_at', 'Last submitted')}</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground text-center">
              No students have attempted this assessment yet.
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.student_user_id}>
            <TableCell>{r.student_email}</TableCell>
            <TableCell>
              {r.attempts_used} of {maxAttempts}
            </TableCell>
            <TableCell>{r.best_raw != null ? `${r.best_raw} / ${r.best_max}` : '—'}</TableCell>
            <TableCell>{r.best_pct != null ? `${r.best_pct.toFixed(2)}%` : '—'}</TableCell>
            <TableCell>
              {r.last_submitted_at ? new Date(r.last_submitted_at).toLocaleString() : '—'}
            </TableCell>
            <TableCell>
              {r.best_attempt_id ? (
                <Link
                  href={`/assessments/${assessmentId}/attempts/${r.best_attempt_id}` as Route}
                  className="text-sm underline"
                >
                  View best
                </Link>
              ) : (
                '—'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
