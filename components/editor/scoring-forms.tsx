'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Choice = { id: string; label: string };

export function McScoringForm({
  body, scoring, onChange,
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
            <input type="radio" name="mc-correct" checked={correct === c.id}
                   onChange={() => setCorrect(c.id)} aria-label={`Choice ${c.id} is correct`} />
            <span className="font-mono text-xs w-6">{c.id}</span>
            <Input value={c.label} onChange={(e) => setLabel(c.id, e.target.value)} />
            <Button type="button" variant="ghost" onClick={() => remove(c.id)} aria-label="Remove">×</Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={addChoice}>+ Add choice</Button>
    </div>
  );
}

export function MaScoringForm({
  body, scoring, onChange,
}: {
  body: { choices?: Choice[] };
  scoring: { correct_ids?: string[]; partial_credit?: boolean };
  onChange: (body: Record<string, unknown>, scoring: Record<string, unknown>) => void;
}) {
  const choices: Choice[] = body.choices ?? [];
  const correct = new Set(scoring.correct_ids ?? []);

  function toggle(id: string) {
    const next = new Set(correct);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
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
            <input type="checkbox" checked={correct.has(c.id)} onChange={() => toggle(c.id)}
                   aria-label={`Choice ${c.id} is correct`} />
            <span className="font-mono text-xs w-6">{c.id}</span>
            <Input value={c.label} onChange={(e) => setLabel(c.id, e.target.value)} />
            <Button type="button" variant="ghost" onClick={() => remove(c.id)} aria-label="Remove">×</Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={addChoice}>+ Add choice</Button>
      <label className="flex items-center gap-2 text-sm mt-2">
        <input type="checkbox" checked={Boolean(scoring.partial_credit)}
               onChange={(e) => onChange({ ...body }, { ...scoring, partial_credit: e.target.checked })} />
        Award partial credit
      </label>
    </div>
  );
}

export function TfScoringForm({
  body: _body, scoring, onChange,
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
          <input type="radio" name="tf-correct" checked={correct} onChange={() => onChange({}, { ...scoring, correct: true })} />
          True
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="tf-correct" checked={!correct && !isUndefined} onChange={() => onChange({}, { ...scoring, correct: false })} />
          False
        </label>
      </div>
    </div>
  );
}
