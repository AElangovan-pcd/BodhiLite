'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Choice = { id: string; label: string };

export function McScoringForm({
  body,
  scoring,
  onChange,
}: {
  body: { choices?: Choice[] };
  scoring: { correct_id?: string };
  onChange: (body: Record<string, unknown>, scoring: Record<string, unknown>) => void;
}) {
  const choices: Choice[] = body.choices ?? [];
  const correct = scoring.correct_id ?? '';

  function setChoices(next: Choice[]) {
    onChange({ ...body, choices: next }, { ...scoring });
  }
  function addChoice() {
    if (choices.length >= 26) return; // Guard: max 26 choices (a-z)
    const id = String.fromCharCode(97 + choices.length); // a, b, c, ...
    setChoices([...choices, { id, label: '' }]);
  }
  function setLabel(id: string, label: string) {
    setChoices(choices.map((c) => (c.id === id ? { ...c, label } : c)));
  }
  function remove(id: string) {
    const next = choices.filter((c) => c.id !== id);
    // If the removed choice was the correct one, clear correct_id
    if (correct === id) {
      onChange({ ...body, choices: next }, { ...scoring, correct_id: undefined });
    } else {
      setChoices(next);
    }
  }
  function setCorrect(id: string) {
    onChange({ ...body }, { ...scoring, correct_id: id });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Choices</Label>
      <ul className="flex flex-col gap-2">
        {choices.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              type="radio"
              name="mc-correct"
              checked={correct === c.id}
              onChange={() => setCorrect(c.id)}
              aria-label={`Choice ${c.id} is correct`}
            />
            <span className="w-6 font-mono text-xs">{c.id}</span>
            <Input value={c.label} onChange={(e) => setLabel(c.id, e.target.value)} />
            <Button type="button" variant="ghost" onClick={() => remove(c.id)} aria-label="Remove">
              ×
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={addChoice}>
        + Add choice
      </Button>
    </div>
  );
}

export function MaScoringForm({
  body,
  scoring,
  onChange,
}: {
  body: { choices?: Choice[] };
  scoring: { correct_ids?: string[]; partial_credit?: boolean };
  onChange: (body: Record<string, unknown>, scoring: Record<string, unknown>) => void;
}) {
  const choices: Choice[] = body.choices ?? [];
  const correct = new Set(scoring.correct_ids ?? []);

  function toggle(id: string) {
    const next = new Set(correct);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange({ ...body }, { ...scoring, correct_ids: [...next] });
  }
  function addChoice() {
    if (choices.length >= 26) return; // Guard: max 26 choices (a-z)
    const id = String.fromCharCode(97 + choices.length);
    onChange({ ...body, choices: [...choices, { id, label: '' }] }, { ...scoring });
  }
  function setLabel(id: string, label: string) {
    onChange(
      { ...body, choices: choices.map((c) => (c.id === id ? { ...c, label } : c)) },
      { ...scoring },
    );
  }
  function remove(id: string) {
    onChange(
      { ...body, choices: choices.filter((c) => c.id !== id) },
      { ...scoring, correct_ids: (scoring.correct_ids ?? []).filter((x) => x !== id) },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Choices (check all correct)</Label>
      <ul className="flex flex-col gap-2">
        {choices.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={correct.has(c.id)}
              onChange={() => toggle(c.id)}
              aria-label={`Choice ${c.id} is correct`}
            />
            <span className="w-6 font-mono text-xs">{c.id}</span>
            <Input value={c.label} onChange={(e) => setLabel(c.id, e.target.value)} />
            <Button type="button" variant="ghost" onClick={() => remove(c.id)} aria-label="Remove">
              ×
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={addChoice}>
        + Add choice
      </Button>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(scoring.partial_credit)}
          onChange={(e) => onChange({ ...body }, { ...scoring, partial_credit: e.target.checked })}
        />
        Award partial credit
      </label>
    </div>
  );
}

export function TfScoringForm({
  body: _body,
  scoring,
  onChange,
}: {
  body: Record<string, unknown>;
  scoring: { correct?: boolean };
  onChange: (body: Record<string, unknown>, scoring: Record<string, unknown>) => void;
}) {
  const isUndefined = scoring.correct === undefined;
  const correct = scoring.correct === true;
  return (
    <div className="flex flex-col gap-2">
      <Label>Correct answer</Label>
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="tf-correct"
            checked={correct}
            onChange={() => onChange({}, { ...scoring, correct: true })}
          />
          True
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="tf-correct"
            checked={!correct && !isUndefined}
            onChange={() => onChange({}, { ...scoring, correct: false })}
          />
          False
        </label>
      </div>
    </div>
  );
}

export function NumericScoringForm({
  body,
  scoring,
  onChange,
}: {
  body: { units?: string };
  scoring: { formula?: string; tolerance?: number };
  onChange: (body: Record<string, unknown>, scoring: Record<string, unknown>) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="formula">Grading formula</Label>
        <Input
          id="formula"
          value={scoring.formula ?? ''}
          onChange={(e) => onChange({ ...body }, { ...scoring, formula: e.target.value })}
          placeholder="e.g. m / molar_mass(c)"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="tolerance">Tolerance</Label>
        <Input
          id="tolerance"
          type="number"
          step="any"
          min={0}
          value={scoring.tolerance ?? 0}
          onChange={(e) => onChange({ ...body }, { ...scoring, tolerance: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="units">Units (optional)</Label>
        <Input
          id="units"
          value={body.units ?? ''}
          onChange={(e) => onChange({ ...body, units: e.target.value }, { ...scoring })}
        />
      </div>
    </div>
  );
}

export function ShortAnswerScoringForm({
  body: _body,
  scoring,
  onChange,
}: {
  body: Record<string, unknown>;
  scoring: { pattern?: string; case_insensitive?: boolean };
  onChange: (body: Record<string, unknown>, scoring: Record<string, unknown>) => void;
}) {
  let regexError: string | null = null;
  try {
    new RegExp(scoring.pattern ?? '');
  } catch (e) {
    regexError = (e as Error).message;
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="pattern">Regex pattern</Label>
      <Input
        id="pattern"
        value={scoring.pattern ?? ''}
        onChange={(e) => onChange({}, { ...scoring, pattern: e.target.value })}
        {...(regexError != null ? { 'aria-invalid': true as const } : {})}
      />
      {regexError && (
        <p role="alert" className="text-destructive text-xs">
          {regexError}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(scoring.case_insensitive)}
          onChange={(e) => onChange({}, { ...scoring, case_insensitive: e.target.checked })}
        />
        Case-insensitive
      </label>
    </div>
  );
}

export function FillInScoringForm({
  body,
  scoring,
  onChange,
}: {
  body: { stem?: string; blanks?: { id: string; prompt?: string }[] };
  scoring: { targets?: { id: string; target: string; case_insensitive?: boolean }[] };
  onChange: (body: Record<string, unknown>, scoring: Record<string, unknown>) => void;
}) {
  // Infer blank IDs from stem tokens {{blank:id}}
  const tokenIds = new Set<string>();
  const stem = body.stem ?? '';
  for (const m of stem.matchAll(/\{\{blank:([a-zA-Z0-9_-]+)\}\}/g)) tokenIds.add(m[1]!);
  const targets = scoring.targets ?? [];
  const blanks = body.blanks ?? [];

  // Sync blanks + targets with token IDs
  function sync() {
    const nextBlanks = [...tokenIds].map((id) => blanks.find((b) => b.id === id) ?? { id });
    const nextTargets = [...tokenIds].map(
      (id) => targets.find((t) => t.id === id) ?? { id, target: '', case_insensitive: false },
    );
    onChange({ ...body, blanks: nextBlanks }, { ...scoring, targets: nextTargets });
  }

  function setTarget(id: string, target: string) {
    onChange(
      { ...body },
      {
        ...scoring,
        targets: [...tokenIds]
          .map(
            (tid) =>
              targets.find((t) => t.id === tid) ?? { id: tid, target: '', case_insensitive: false },
          )
          .map((t) => (t.id === id ? { ...t, target } : t)),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Blanks (auto-detected from stem tokens)</Label>
      {tokenIds.size === 0 && (
        <p className="text-muted-foreground text-sm">
          Add <code>{'{{blank:id}}'}</code> tokens in the stem to define blanks.
        </p>
      )}
      <Button type="button" variant="outline" onClick={sync}>
        Sync from stem
      </Button>
      <ul className="flex flex-col gap-2">
        {[...tokenIds].map((id) => {
          const t = targets.find((x) => x.id === id);
          return (
            <li key={id} className="flex items-center gap-2">
              <span className="w-16 font-mono text-xs">{id}</span>
              <Input
                value={t?.target ?? ''}
                placeholder="target answer"
                onChange={(e) => setTarget(id, e.target.value)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
