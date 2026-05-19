import Link from 'next/link';
import type { Route } from 'next';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Props = {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  assessment_type: 'quiz' | 'exam';
  questionCount: number;
  updated_at: string;
};

export function AssessmentCard(p: Props) {
  return (
    <Link href={`/assessments/${p.id}` as Route} className="block">
      <Card className="hover:bg-muted/40 transition-colors">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{p.title}</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline">{p.assessment_type}</Badge>
              <Badge variant={p.status === 'published' ? 'default' : 'secondary'}>
                {p.status}
              </Badge>
            </div>
          </div>
          <CardDescription className="font-mono text-xs">{p.slug}</CardDescription>
        </CardHeader>
        <CardFooter className="text-muted-foreground text-xs">
          {p.questionCount} question{p.questionCount === 1 ? '' : 's'} ·
          updated {new Date(p.updated_at).toLocaleDateString()}
        </CardFooter>
      </Card>
    </Link>
  );
}
