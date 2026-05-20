'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChoiceSpec, ChemistryCompoundSpec, RandintSpec, RandfloatSpec } from './variable-specs';

type VType = 'choice' | 'chemistry_compound' | 'randint' | 'randfloat' | 'derived';

type V = {
  name: string;
  type: VType;
  position: number;
  spec: Record<string, unknown>;
};

const DEFAULTS: Record<VType, Record<string, unknown>> = {
  choice: { values: [] },
  chemistry_compound: { values: [] },
  randint: { min: 1, max: 10 },
  randfloat: { min: 0, max: 1, decimals: 2 },
  derived: { expression: '' },
};

export function VariablesSection({
  variables, onChange,
}: {
  variables: V[];
  onChange: (next: V[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    const next = new Set(expanded);
    if (next.has(i)) { next.delete(i); } else { next.add(i); }
    setExpanded(next);
  }
  function add() {
    onChange([
      ...variables,
      { name: `v${variables.length + 1}`, type: 'randint', position: variables.length + 1,
        spec: DEFAULTS.randint },
    ]);
  }
  function set(i: number, patch: Partial<V>) {
    onChange(variables.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function setType(i: number, type: VType) {
    set(i, { type, spec: DEFAULTS[type] });
  }
  function remove(i: number) {
    onChange(variables.filter((_, idx) => idx !== i).map((v, idx) => ({ ...v, position: idx + 1 })));
  }

  function renderSpec(v: V, i: number) {
    const onSpecChange = (next: object) => set(i, { spec: next as Record<string, unknown> });
    switch (v.type) {
      case 'choice': return <ChoiceSpec spec={v.spec as never} onChange={onSpecChange} />;
      case 'chemistry_compound':
        return <ChemistryCompoundSpec spec={v.spec as never} onChange={onSpecChange} />;
      case 'randint': return <RandintSpec spec={v.spec as never} onChange={onSpecChange} />;
      case 'randfloat': return <RandfloatSpec spec={v.spec as never} onChange={onSpecChange} />;
      case 'derived':
        return <p className="text-muted-foreground text-sm">Derived editor — Task 24.</p>;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Variables (optional — parameterization)</Label>
      <ul className="flex flex-col gap-2">
        {variables.map((v, i) => (
          <li key={i} className="rounded border p-2">
            <div className="flex items-center gap-2">
              <Input className="w-40 font-mono text-sm" value={v.name}
                     onChange={(e) => set(i, { name: e.target.value })}
                     aria-label={`Variable ${i + 1} name`} />
              <Select value={v.type} onValueChange={(t) => setType(i, t as VType)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="choice">choice</SelectItem>
                  <SelectItem value="chemistry_compound">chemistry_compound</SelectItem>
                  <SelectItem value="randint">randint</SelectItem>
                  <SelectItem value="randfloat">randfloat</SelectItem>
                  <SelectItem value="derived">derived</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost"
                      onClick={() => toggle(i)}
                      aria-expanded={expanded.has(i)} aria-controls={`vspec-${i}`}>
                {expanded.has(i) ? '▴' : '▾'} Configure
              </Button>
              <Button type="button" variant="ghost" onClick={() => remove(i)} aria-label="Remove">×</Button>
            </div>
            {expanded.has(i) && (
              <div id={`vspec-${i}`} className="mt-2">{renderSpec(v, i)}</div>
            )}
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={add}>+ Add variable</Button>
    </div>
  );
}
