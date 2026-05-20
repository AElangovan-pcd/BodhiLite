'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const PRESETS = [
  { value: 0, label: 'Author (seed=0)' },
  { value: 1, label: 'Test student 1' },
  { value: 2, label: 'Test student 2' },
  { value: 3, label: 'Test student 3' },
];

export function SeedSwitcher({
  seed, onSeedChange,
}: {
  seed: number;
  onSeedChange: (next: number) => void;
}) {
  const isPreset = PRESETS.some((p) => p.value === seed);
  const [custom, setCustom] = useState(isPreset ? '' : String(seed));

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">Preview as</span>
      <Select
        value={isPreset ? String(seed) : 'custom'}
        onValueChange={(v) => {
          if (v === 'custom') return;
          onSeedChange(Number(v));
        }}
      >
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
          ))}
          <SelectItem value="custom">Custom seed…</SelectItem>
        </SelectContent>
      </Select>
      {!isPreset && (
        <Input type="number" className="w-28" value={custom}
               onChange={(e) => { setCustom(e.target.value); onSeedChange(Number(e.target.value) || 0); }}
               aria-label="Custom seed" />
      )}
    </div>
  );
}
