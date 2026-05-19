import type { MaterializedValues, CompoundValue } from '@/lib/materializer/types';

const VAR = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stringify(v: unknown): string {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'label' in v) return (v as CompoundValue).label;
  return '';
}

export function substitute(template: string, values: MaterializedValues): string {
  return template.replace(VAR, (match, name) => {
    if (!(name in values)) return match;
    return htmlEscape(stringify(values[name]));
  });
}
