import periodic from './periodic-table.json' with { type: 'json' };

type Element = { Z: number; atomic_mass: number };
const ELEMENTS = periodic as Record<string, Element>;

/**
 * Parse a chemical formula and return its molar mass (g/mol).
 * Supports nested parentheses with integer multipliers.
 */
export function molarMass(formula: string): number {
  if (!formula || !/^[A-Za-z0-9()]+$/.test(formula)) {
    throw new Error(`Malformed formula: ${formula}`);
  }
  const counts = parse(formula);
  let mass = 0;
  for (const [el, n] of counts.entries()) {
    const e = ELEMENTS[el];
    if (!e) throw new Error(`Unknown element: ${el}`);
    mass += e.atomic_mass * n;
  }
  return mass;
}

function parse(formula: string): Map<string, number> {
  let i = 0;
  const counts = new Map<string, number>();

  function readInt(): number {
    const start = i;
    while (i < formula.length && formula[i]! >= '0' && formula[i]! <= '9') i++;
    return start === i ? 1 : parseInt(formula.slice(start, i), 10);
  }

  function readElement(): string {
    const start = i;
    if (!(formula[i]! >= 'A' && formula[i]! <= 'Z')) {
      throw new Error(`Expected element at position ${i} of ${formula}`);
    }
    i++;
    while (i < formula.length && formula[i]! >= 'a' && formula[i]! <= 'z') i++;
    return formula.slice(start, i);
  }

  function readGroup(): Map<string, number> {
    const inner = new Map<string, number>();
    while (i < formula.length && formula[i] !== ')') {
      if (formula[i] === '(') {
        i++;
        const sub = readGroup();
        if (formula[i] !== ')') throw new Error(`Unbalanced ( in ${formula}`);
        i++;
        const mult = readInt();
        for (const [k, v] of sub.entries()) {
          inner.set(k, (inner.get(k) ?? 0) + v * mult);
        }
      } else {
        const el = readElement();
        const n = readInt();
        inner.set(el, (inner.get(el) ?? 0) + n);
      }
    }
    return inner;
  }

  const top = readGroup();
  if (i !== formula.length) throw new Error(`Unparsed trailing characters in ${formula}`);
  for (const [k, v] of top.entries()) counts.set(k, (counts.get(k) ?? 0) + v);
  return counts;
}
