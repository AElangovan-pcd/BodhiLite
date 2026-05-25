'use client';

import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { evaluate, EvalError } from '@/lib/grading';
import type { MaterializedValues } from '@/lib/materializer/types';

export function ChoiceSpec({
  spec,
  onChange,
}: {
  spec: { values?: string[] };
  onChange: (next: object) => void;
}) {
  const text = (spec.values ?? []).join('\n');
  return (
    <div className="flex flex-col gap-1">
      <Label>Values (one per line)</Label>
      <Textarea
        rows={4}
        value={text}
        onChange={(e) => onChange({ values: e.target.value.split('\n').filter(Boolean) })}
      />
    </div>
  );
}

export function ChemistryCompoundSpec({
  spec,
  onChange,
}: {
  spec: { values?: { label: string; smiles: string }[] };
  onChange: (next: object) => void;
}) {
  const values = spec.values ?? [];
  function set(i: number, patch: Partial<{ label: string; smiles: string }>) {
    onChange({ values: values.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });
  }
  function add() {
    onChange({ values: [...values, { label: '', smiles: '' }] });
  }
  function remove(i: number) {
    onChange({ values: values.filter((_, idx) => idx !== i) });
  }
  return (
    <div className="flex flex-col gap-2">
      <Label>Compounds</Label>
      <ul className="flex flex-col gap-2">
        {values.map((v, i) => (
          <li key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <Input
              placeholder="label (e.g. NaCl)"
              value={v.label}
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <Input
              placeholder="SMILES"
              value={v.smiles}
              className="font-mono"
              onChange={(e) => set(i, { smiles: e.target.value })}
            />
            <Button type="button" variant="ghost" onClick={() => remove(i)}>
              ×
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={add}>
        + Add compound
      </Button>
    </div>
  );
}

export function RandintSpec({
  spec,
  onChange,
}: {
  spec: { min?: number; max?: number; step?: number; units?: string };
  onChange: (next: object) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <div className="flex flex-col gap-1">
        <Label>Min</Label>
        <Input
          type="number"
          value={spec.min ?? 0}
          onChange={(e) => onChange({ ...spec, min: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Max</Label>
        <Input
          type="number"
          value={spec.max ?? 10}
          onChange={(e) => onChange({ ...spec, max: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Step</Label>
        <Input
          type="number"
          min={1}
          value={spec.step ?? 1}
          onChange={(e) => onChange({ ...spec, step: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Units</Label>
        <Input
          value={spec.units ?? ''}
          onChange={(e) => onChange({ ...spec, units: e.target.value })}
        />
      </div>
    </div>
  );
}

export function RandfloatSpec({
  spec,
  onChange,
}: {
  spec: { min?: number; max?: number; decimals?: number; units?: string };
  onChange: (next: object) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <div className="flex flex-col gap-1">
        <Label>Min</Label>
        <Input
          type="number"
          step="any"
          value={spec.min ?? 0}
          onChange={(e) => onChange({ ...spec, min: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Max</Label>
        <Input
          type="number"
          step="any"
          value={spec.max ?? 1}
          onChange={(e) => onChange({ ...spec, max: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Decimals</Label>
        <Input
          type="number"
          min={0}
          max={10}
          value={spec.decimals ?? 2}
          onChange={(e) => onChange({ ...spec, decimals: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Units</Label>
        <Input
          value={spec.units ?? ''}
          onChange={(e) => onChange({ ...spec, units: e.target.value })}
        />
      </div>
    </div>
  );
}

export function DerivedSpec({
  spec,
  scope,
  onChange,
}: {
  spec: { expression?: string };
  scope: MaterializedValues;
  onChange: (next: object) => void;
}) {
  const evalResult = useMemo(() => {
    const expr = spec.expression ?? '';
    if (!expr) return { state: 'empty' as const };
    try {
      return { state: 'ok' as const, value: evaluate(expr, scope) };
    } catch (e) {
      return {
        state: 'error' as const,
        msg: e instanceof EvalError ? e.message : (e as Error).message,
      };
    }
  }, [spec.expression, scope]);

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="derived-expr">Expression</Label>
      <Textarea
        id="derived-expr"
        rows={2}
        className="font-mono text-sm"
        value={spec.expression ?? ''}
        onChange={(e) => onChange({ expression: e.target.value })}
      />
      {evalResult.state === 'ok' && (
        <p className="text-muted-foreground text-xs">
          evaluates to:{' '}
          <span className="text-foreground font-mono">{String(evalResult.value)}</span>
        </p>
      )}
      {evalResult.state === 'error' && (
        <p role="alert" className="text-destructive text-xs">
          {evalResult.msg}
        </p>
      )}
    </div>
  );
}
