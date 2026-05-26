'use client';

import { useId, useState } from 'react';
import { Markdown } from '@/lib/rendering';
import { Input } from '@/components/ui/input';
import type { RenderedBody } from '@/lib/rendering';
import type { Response } from '@/lib/grading';

type ControlledProps = {
  value?: Response | null;
  onChange?: (next: Response) => void;
  disabled?: boolean;
};

export function AnswerSurface({ body, ...controlled }: { body: RenderedBody } & ControlledProps) {
  const key = JSON.stringify(body);
  switch (body.kind) {
    case 'mc':
      return <McSurface key={key} body={body} {...controlled} />;
    case 'ma':
      return <MaSurface key={key} body={body} {...controlled} />;
    case 'tf':
      return <TfSurface key={key} {...controlled} />;
    case 'numeric':
      return <NumericSurface key={key} body={body} {...controlled} />;
    case 'short_answer':
      return <ShortAnswerSurface key={key} {...controlled} />;
    case 'fill_in':
      return <FillInSurface key={key} body={body} {...controlled} />;
  }
}

function McSurface({
  body,
  value,
  onChange,
  disabled,
}: { body: Extract<RenderedBody, { kind: 'mc' }> } & ControlledProps) {
  const groupId = useId();
  const [local, setLocal] = useState<string | null>(null);
  const controlled = value !== undefined && onChange !== undefined;
  const picked = controlled ? ((value as Response & { type: 'mc' })?.choice_id ?? null) : local;
  const set = (id: string) => {
    if (controlled) onChange!({ type: 'mc', choice_id: id });
    else setLocal(id);
  };
  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend className="sr-only">Answer</legend>
      {body.choices.map((c) => (
        <label key={c.id} className="flex items-center gap-2">
          <input
            type="radio"
            name={`mc-${groupId}`}
            checked={picked === c.id}
            onChange={() => set(c.id)}
            disabled={disabled}
          />
          <Markdown source={c.label_substituted} />
        </label>
      ))}
    </fieldset>
  );
}

function MaSurface({
  body,
  value,
  onChange,
  disabled,
}: { body: Extract<RenderedBody, { kind: 'ma' }> } & ControlledProps) {
  const [local, setLocal] = useState<Set<string>>(new Set());
  const controlled = value !== undefined && onChange !== undefined;
  const picked = controlled
    ? new Set((value as Response & { type: 'ma' })?.choice_ids ?? [])
    : local;

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (controlled) onChange!({ type: 'ma', choice_ids: [...next] });
    else setLocal(next);
  };

  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend className="sr-only">Pick all that apply</legend>
      {body.choices.map((c) => (
        <label key={c.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={picked.has(c.id)}
            onChange={() => toggle(c.id)}
            disabled={disabled}
          />
          <Markdown source={c.label_substituted} />
        </label>
      ))}
    </fieldset>
  );
}

function TfSurface({ value, onChange, disabled }: ControlledProps) {
  const groupId = useId();
  const [local, setLocal] = useState<boolean | null>(null);
  const controlled = value !== undefined && onChange !== undefined;
  const v = controlled ? ((value as Response & { type: 'tf' })?.value ?? null) : local;
  const set = (b: boolean) => {
    if (controlled) onChange!({ type: 'tf', value: b });
    else setLocal(b);
  };
  return (
    <fieldset className="flex items-center gap-4" disabled={disabled}>
      <legend className="sr-only">Answer</legend>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name={`tf-${groupId}`}
          checked={v === true}
          onChange={() => set(true)}
          disabled={disabled}
        />{' '}
        True
      </label>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name={`tf-${groupId}`}
          checked={v === false}
          onChange={() => set(false)}
          disabled={disabled}
        />{' '}
        False
      </label>
    </fieldset>
  );
}

function NumericSurface({
  body,
  value,
  onChange,
  disabled,
}: { body: Extract<RenderedBody, { kind: 'numeric' }> } & ControlledProps) {
  const [local, setLocal] = useState('');
  const controlled = value !== undefined && onChange !== undefined;
  const v = controlled ? ((value as Response & { type: 'numeric' })?.value ?? '') : local;
  const set = (s: string) => {
    if (controlled) onChange!({ type: 'numeric', value: s });
    else setLocal(s);
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        step="any"
        value={v}
        onChange={(e) => set(e.target.value)}
        className="w-40"
        aria-label="Numeric answer"
        disabled={disabled}
      />
      {body.units && <span className="text-muted-foreground text-sm">{body.units}</span>}
    </div>
  );
}

function ShortAnswerSurface({ value, onChange, disabled }: ControlledProps) {
  const [local, setLocal] = useState('');
  const controlled = value !== undefined && onChange !== undefined;
  const v = controlled ? ((value as Response & { type: 'short_answer' })?.value ?? '') : local;
  const set = (s: string) => {
    if (controlled) onChange!({ type: 'short_answer', value: s });
    else setLocal(s);
  };
  return (
    <Input
      value={v}
      onChange={(e) => set(e.target.value)}
      aria-label="Short answer"
      disabled={disabled}
    />
  );
}

function FillInSurface({
  body,
  value,
  onChange,
  disabled,
}: { body: Extract<RenderedBody, { kind: 'fill_in' }> } & ControlledProps) {
  const [local, setLocal] = useState<Record<string, string>>({});
  const controlled = value !== undefined && onChange !== undefined;
  const vals = controlled ? ((value as Response & { type: 'fill_in' })?.blanks ?? {}) : local;
  const set = (id: string, s: string) => {
    const next = { ...vals, [id]: s };
    if (controlled) onChange!({ type: 'fill_in', blanks: next });
    else setLocal(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {body.blanks.map((b) => (
        <label key={b.id} className="flex items-center gap-2">
          <span className="w-24 font-mono text-xs">{b.id}</span>
          <Input
            value={vals[b.id] ?? ''}
            onChange={(e) => set(b.id, e.target.value)}
            placeholder={b.prompt}
            disabled={disabled}
            aria-label={`Blank ${b.id}`}
          />
        </label>
      ))}
    </div>
  );
}
