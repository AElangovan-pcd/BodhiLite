import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type QuestionRow = {
  id: string;
  position: number;
  type: string;
  stem_preview: string;
};

export function QuestionsTable({
  assessmentId,
  questions,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  assessmentId: string;
  questions: QuestionRow[];
  onMoveUp: (formData: FormData) => Promise<void>;
  onMoveDown: (formData: FormData) => Promise<void>;
  onDelete: (formData: FormData) => Promise<void>;
}) {
  if (questions.length === 0) {
    return (
      <p className="text-muted-foreground my-4">No questions yet. Add your first one.</p>
    );
  }
  return (
    <ul className="divide-y divide-border my-4">
      {questions.map((q, i) => (
        <li key={q.id} className="flex items-center gap-3 py-2">
          <span className="text-muted-foreground w-8 text-sm">Q{q.position}</span>
          <Badge variant="outline">{q.type}</Badge>
          <Link href={`/assessments/${assessmentId}/questions/${q.id}` as Route}
                className="flex-1 truncate hover:underline">
            {q.stem_preview || <em className="text-muted-foreground">(empty stem)</em>}
          </Link>
          <form action={onMoveUp}><input type="hidden" name="qid" value={q.id} />
            <Button type="submit" variant="ghost" size="default" disabled={i === 0}
                    aria-label={`Move question ${q.position} up`}>↑</Button>
          </form>
          <form action={onMoveDown}><input type="hidden" name="qid" value={q.id} />
            <Button type="submit" variant="ghost" size="default"
                    disabled={i === questions.length - 1}
                    aria-label={`Move question ${q.position} down`}>↓</Button>
          </form>
          <form action={onDelete}><input type="hidden" name="qid" value={q.id} />
            <Button type="submit" variant="destructive" size="default"
                    aria-label={`Delete question ${q.position}`}>×</Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
