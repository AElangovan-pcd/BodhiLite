'use client';

import { Markdown } from '@/lib/rendering';
import { AnswerSurface } from '@/components/preview/answer-surfaces';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { AnswerSnapshot, Response } from '@/lib/grading';

export type QuestionCardProps = {
  position: number;
  snapshot: AnswerSnapshot;
  response: Response | null;
  onChange: (r: Response) => void;
  anchor?: string;
};

export function QuestionCard({
  position,
  snapshot,
  response,
  onChange,
  anchor,
}: QuestionCardProps) {
  return (
    <Card id={anchor} className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">Q{position + 1}</h2>
        <Badge variant="secondary">{snapshot.question_type}</Badge>
      </div>
      <div className="prose mb-3 max-w-none">
        <Markdown source={snapshot.render.rendered_stem} />
      </div>
      <AnswerSurface
        body={snapshot.render.rendered_body}
        value={response}
        onChange={onChange}
      />
    </Card>
  );
}
