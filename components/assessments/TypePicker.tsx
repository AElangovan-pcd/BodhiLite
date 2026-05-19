import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const TYPES = [
  { type: 'mc', name: 'Multiple choice', desc: 'One correct choice.' },
  { type: 'ma', name: 'Multiple answer', desc: 'One or more correct choices.' },
  { type: 'tf', name: 'True / false', desc: 'Boolean answer.' },
  { type: 'numeric', name: 'Numeric (with tolerance)', desc: 'Compare to a computed value.' },
  { type: 'short_answer', name: 'Short answer (regex)', desc: 'Free text matched against a pattern.' },
  { type: 'fill_in', name: 'Fill in the blank', desc: 'Inline {{blank:id}} tokens.' },
];

export function TypePicker({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {TYPES.map((t) => (
        <form key={t.type} action={action}>
          <input type="hidden" name="type" value={t.type} />
          <button type="submit" className="text-left w-full">
            <Card className="hover:bg-muted/40 transition-colors">
              <CardHeader>
                <CardTitle>{t.name}</CardTitle>
                <CardDescription>{t.desc}</CardDescription>
              </CardHeader>
            </Card>
          </button>
        </form>
      ))}
    </div>
  );
}
