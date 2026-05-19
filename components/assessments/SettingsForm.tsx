import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type AssessmentRow = {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  assessment_type: 'quiz' | 'exam';
  time_limit_seconds: number | null;
  default_attempts: number;
  randomize_questions: boolean;
  randomize_choices: boolean;
  opens_at: string | null;
  closes_at: string | null;
};

export function SettingsForm({
  assessment,
  action,
}: {
  assessment: AssessmentRow;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={assessment.id} />

      <div className="flex flex-col gap-1">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={assessment.title} required />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" defaultValue={assessment.slug} required
               pattern="^[a-z0-9-]+$" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="status">Status</Label>
        <select id="status" name="status" defaultValue={assessment.status}
                className="border-input bg-background rounded-md border px-3 py-1 text-sm">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="default_attempts">Default attempts</Label>
        <Input id="default_attempts" name="default_attempts" type="number" min={1}
               defaultValue={assessment.default_attempts} />
      </div>

      {assessment.assessment_type === 'exam' && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="time_limit_seconds">Time limit (seconds)</Label>
          <Input id="time_limit_seconds" name="time_limit_seconds" type="number" min={1}
                 defaultValue={assessment.time_limit_seconds ?? undefined} />
        </div>
      )}

      <label className="flex items-center gap-2">
        <input type="checkbox" name="randomize_questions"
               defaultChecked={assessment.randomize_questions} />
        Randomize question order
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="randomize_choices"
               defaultChecked={assessment.randomize_choices} />
        Randomize choice order (mc/ma)
      </label>

      <div className="md:col-span-2">
        <Button type="submit">Save settings</Button>
      </div>
    </form>
  );
}
