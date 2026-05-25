'use client';

import { useState } from 'react';
import { Markdown } from '@/lib/rendering';
import { Input } from '@/components/ui/input';
import type { RenderedBody } from '@/lib/rendering';

export function AnswerSurface({ body }: { body: RenderedBody }) {
  // Local-only state, reset when the body shape changes
  const key = JSON.stringify(body);

  switch (body.kind) {
    case 'mc':
      return <McSurface key={key} body={body} />;
    case 'ma':
      return <MaSurface key={key} body={body} />;
    case 'tf':
      return <TfSurface key={key} />;
    case 'numeric':
      return <NumericSurface key={key} body={body} />;
    case 'short_answer':
      return <ShortAnswerSurface key={key} />;
    case 'fill_in':
      return <FillInSurface key={key} body={body} />;
  }
}

function McSurface({ body }: { body: Extract<RenderedBody, { kind: 'mc' }> }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">Answer</legend>
      {body.choices.map((c) => (
        <label key={c.id} className="flex items-center gap-2">
          <input
            type="radio"
            name="mc-preview"
            checked={picked === c.id}
            onChange={() => setPicked(c.id)}
          />
          <Markdown source={c.label_substituted} />
        </label>
      ))}
    </fieldset>
  );
}

function MaSurface({ body }: { body: Extract<RenderedBody, { kind: 'ma' }> }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setPicked(next);
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">Pick all that apply</legend>
      {body.choices.map((c) => (
        <label key={c.id} className="flex items-center gap-2">
          <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
          <Markdown source={c.label_substituted} />
        </label>
      ))}
    </fieldset>
  );
}

function TfSurface() {
  const [v, setV] = useState<boolean | null>(null);
  return (
    <fieldset className="flex items-center gap-4">
      <legend className="sr-only">Answer</legend>
      <label className="flex items-center gap-2">
        <input type="radio" name="tf-preview" checked={v === true} onChange={() => setV(true)} />{' '}
        True
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" name="tf-preview" checked={v === false} onChange={() => setV(false)} />{' '}
        False
      </label>
    </fieldset>
  );
}

function NumericSurface({ body }: { body: Extract<RenderedBody, { kind: 'numeric' }> }) {
  const [v, setV] = useState('');
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        step="any"
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="w-40"
        aria-label="Numeric answer"
      />
      {body.units && <span className="text-muted-foreground text-sm">{body.units}</span>}
    </div>
  );
}

function ShortAnswerSurface() {
  const [v, setV] = useState('');
  return <Input value={v} onChange={(e) => setV(e.target.value)} aria-label="Short answer" />;
}

function FillInSurface({ body }: { body: Extract<RenderedBody, { kind: 'fill_in' }> }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  return (
    <div className="flex flex-col gap-2">
      {body.blanks.map((b) => (
        <label key={b.id} className="flex items-center gap-2">
          <span className="w-24 font-mono text-xs">{b.id}</span>
          <Input
            value={vals[b.id] ?? ''}
            onChange={(e) => setVals((p) => ({ ...p, [b.id]: e.target.value }))}
            placeholder={b.prompt}
          />
        </label>
      ))}
    </div>
  );
}
