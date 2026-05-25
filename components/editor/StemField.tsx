'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function StemField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="stem">Stem</Label>
      <Textarea
        id="stem"
        name="stem"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby="stem-hint"
      />
      <p id="stem-hint" className="text-muted-foreground text-xs">
        Markdown supported. Use <code>{'{{var}}'}</code> for variable substitution,
        <code> $...$ </code> for inline math, <code> $$...$$ </code> for display math,
        <code> {'{{blank:id}}'} </code> for fill-in blanks.
      </p>
    </div>
  );
}
