'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PRESETS = [
  { value: 0, label: 'Author (seed=0)' },
  { value: 1, label: 'Test student 1' },
  { value: 2, label: 'Test student 2' },
  { value: 3, label: 'Test student 3' },
];

function isPreset(seed: number): boolean {
  return PRESETS.some((p) => p.value === seed);
}

export function SeedSwitcher({
  seed,
  onSeedChange,
}: {
  seed: number;
  onSeedChange: (next: number) => void;
}) {
  // Initial customMode is true iff the incoming seed isn't a preset (e.g. deep-link with ?seed=42).
  const [customMode, setCustomMode] = useState<boolean>(() => !isPreset(seed));
  const [custom, setCustom] = useState<string>(() => (isPreset(seed) ? '' : String(seed)));

  function onSelect(v: string) {
    if (v === 'custom') {
      setCustomMode(true);
      // Do not change seed yet — user will type the value.
      return;
    }
    setCustomMode(false);
    setCustom('');
    onSeedChange(Number(v));
  }

  function onCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setCustom(raw);
    const trimmed = raw.trim();
    if (trimmed === '') return; // hold mid-edit; don't snap to 0
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) onSeedChange(parsed);
    // Non-numeric junk: ignore (don't propagate); user sees the raw chars in the field
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs" aria-hidden="true">
        Preview as
      </span>
      <Select value={customMode ? 'custom' : String(seed)} onValueChange={onSelect}>
        <SelectTrigger className="w-48" aria-label="Preview as">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={String(p.value)}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom seed…</SelectItem>
        </SelectContent>
      </Select>
      {customMode && (
        <Input
          type="number"
          className="w-28"
          value={custom}
          onChange={onCustomChange}
          aria-label="Custom seed"
        />
      )}
    </div>
  );
}
