import * as acorn from 'acorn';
import type { CompoundValue, MaterializedValue } from '@/lib/materializer/types';
import { molarMass } from './chem-data/molar-mass';
import periodic from './chem-data/periodic-table.json' with { type: 'json' };
import compounds from './chem-data/common-compounds.json' with { type: 'json' };

export class EvalError extends Error {
  override name = 'EvalError';
}

type Vars = Record<string, MaterializedValue>;
type AllowedFn = (...args: unknown[]) => number;

const FUNCS: Record<string, AllowedFn> = {
  sqrt: (x) => Math.sqrt(asNumber(x)),
  log: (x) => Math.log(asNumber(x)),
  log10: (x) => Math.log10(asNumber(x)),
  exp: (x) => Math.exp(asNumber(x)),
  abs: (x) => Math.abs(asNumber(x)),
  sin: (x) => Math.sin(asNumber(x)),
  cos: (x) => Math.cos(asNumber(x)),
  tan: (x) => Math.tan(asNumber(x)),
  min: (...xs) => Math.min(...xs.map(asNumber)),
  max: (...xs) => Math.max(...xs.map(asNumber)),
  pow: (b, e) => Math.pow(asNumber(b), asNumber(e)),
  molar_mass: (arg) => molarMass(asFormula(arg)),
  atomic_number: (arg) => {
    const sym = asString(arg);
    const e = (periodic as Record<string, { Z: number }>)[sym];
    if (!e) throw new EvalError(`Unknown element: ${sym}`);
    return e.Z;
  },
  density: (arg) => {
    const key = asString(arg);
    const c = (compounds as Record<string, { density?: number }>)[key];
    if (!c?.density) throw new EvalError(`Unknown compound density: ${key}`);
    return c.density;
  },
};

function asNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  throw new EvalError(`Expected number, got ${typeof v}`);
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isCompound(v)) return v.label;
  throw new EvalError(`Expected string or compound, got ${typeof v}`);
}

function asFormula(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isCompound(v)) return v.label;
  throw new EvalError(`Expected formula string or chemistry_compound, got ${typeof v}`);
}

function isCompound(v: unknown): v is CompoundValue {
  return typeof v === 'object' && v !== null && 'smiles' in v && 'label' in v;
}

export function evaluate(expr: string, vars: Vars): number {
  let ast: acorn.Expression;
  try {
    ast = acorn.parseExpressionAt(expr, 0, {
      ecmaVersion: 2020,
      sourceType: 'script',
    }) as unknown as acorn.Expression;
  } catch (e) {
    throw new EvalError(`Parse error: ${(e as Error).message}`);
  }
  return asNumber(walk(ast as Node, vars));
}

type Node = acorn.Node & { type: string };

function walk(node: Node, vars: Vars): unknown {
  switch (node.type) {
    case 'Literal': {
      const n = node as unknown as { value: unknown };
      if (typeof n.value === 'number' || typeof n.value === 'string') return n.value;
      if (typeof n.value === 'bigint') {
        throw new EvalError('BigInt literals are not supported');
      }
      throw new EvalError(`Unsupported literal: ${typeof n.value}`);
    }
    case 'Identifier': {
      const n = node as unknown as { name: string };
      if (!(n.name in vars)) throw new EvalError(`Unknown variable: ${n.name}`);
      return vars[n.name];
    }
    case 'BinaryExpression': {
      const n = node as unknown as { operator: string; left: Node; right: Node };
      const l = asNumber(walk(n.left, vars));
      const r = asNumber(walk(n.right, vars));
      switch (n.operator) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return l / r;
        case '**':
          return l ** r;
        case '%':
          return l % r;
        case '<':
          return l < r ? 1 : 0;
        case '<=':
          return l <= r ? 1 : 0;
        case '>':
          return l > r ? 1 : 0;
        case '>=':
          return l >= r ? 1 : 0;
        case '==':
          return l === r ? 1 : 0;
        case '!=':
          return l !== r ? 1 : 0;
        default:
          throw new EvalError(`Unsupported operator: ${n.operator}`);
      }
    }
    case 'UnaryExpression': {
      const n = node as unknown as { operator: string; argument: Node };
      const v = asNumber(walk(n.argument, vars));
      if (n.operator === '-') return -v;
      if (n.operator === '+') return +v;
      throw new EvalError(`Unsupported unary: ${n.operator}`);
    }
    case 'LogicalExpression': {
      const n = node as unknown as { operator: string; left: Node; right: Node };
      const l = asNumber(walk(n.left, vars));
      if (n.operator === '&&') return l ? walk(n.right, vars) : l;
      if (n.operator === '||') return l ? l : walk(n.right, vars);
      throw new EvalError(`Unsupported logical: ${n.operator}`);
    }
    case 'ConditionalExpression': {
      const n = node as unknown as { test: Node; consequent: Node; alternate: Node };
      const t = asNumber(walk(n.test, vars));
      return t ? walk(n.consequent, vars) : walk(n.alternate, vars);
    }
    case 'CallExpression': {
      const n = node as unknown as { callee: Node; arguments: Node[] };
      if (n.callee.type !== 'Identifier') {
        throw new EvalError('Only direct function calls allowed');
      }
      const name = (n.callee as unknown as { name: string }).name;
      const fn = FUNCS[name];
      if (!fn) throw new EvalError(`Unknown function: ${name}`);
      const args = n.arguments.map((a) => walk(a, vars));
      return fn(...args);
    }
    default:
      throw new EvalError(`Disallowed AST node: ${node.type}`);
  }
}
