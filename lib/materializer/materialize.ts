import { mulberry32 } from '@/lib/rng/mulberry32';
import type { VariableSpec } from '@/lib/schemas/variables';
import type { MaterializedValues, MaterializedValue } from './types';

export function materialize(specs: VariableSpec[], seed: number): MaterializedValues {
  const rng = mulberry32(seed);
  const ordered = [...specs].sort((a, b) => a.position - b.position);
  const out: MaterializedValues = {};

  for (const v of ordered) {
    out[v.name] = materializeOne(v, rng, out);
  }
  return out;
}

function materializeOne(
  v: VariableSpec,
  rng: () => number,
  _scope: MaterializedValues,
): MaterializedValue {
  switch (v.type) {
    case 'choice': {
      const values = v.spec.values;
      return values[Math.floor(rng() * values.length)]!;
    }
    case 'chemistry_compound': {
      const values = v.spec.values;
      return values[Math.floor(rng() * values.length)]!;
    }
    case 'randint': {
      const { min, max, step } = v.spec;
      if (step && step > 1) {
        const buckets = Math.floor((max - min) / step) + 1;
        return min + Math.floor(rng() * buckets) * step;
      }
      return min + Math.floor(rng() * (max - min + 1));
    }
    case 'randfloat': {
      const { min, max, decimals } = v.spec;
      const raw = min + rng() * (max - min);
      if (decimals == null) return raw;
      const f = 10 ** decimals;
      return Math.round(raw * f) / f;
    }
    case 'derived': {
      // Implemented in Task 9
      throw new Error('derived variables not yet supported');
    }
  }
}
