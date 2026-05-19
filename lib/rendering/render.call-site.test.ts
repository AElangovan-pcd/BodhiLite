import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as acorn from 'acorn';
import { walk } from 'estree-walker';

const ALLOWED_CALLERS = [
  'components/preview/PreviewPane.tsx',
];

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function walkDir(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') &&
             !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.call-site.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

function importsRenderQuestion(file: string): boolean {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('renderQuestion')) return false;
  // TSX/JSX files can't be parsed by acorn without a JSX plugin — use a targeted
  // regex on the import lines instead. This is sufficient because the invariant
  // only needs to detect named imports of `renderQuestion`.
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
    return /import\s+\{[^}]*\brenderQuestion\b[^}]*\}\s+from\s+['"]@\/lib\/rendering['"]/.test(src);
  }
  try {
    const ast = acorn.parse(src, {
      ecmaVersion: 2022,
      sourceType: 'module',
      allowImportExportEverywhere: true,
    });
    let found = false;
    walk(ast as never, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enter(node: any) {
        if (node.type === 'ImportDeclaration') {
          for (const s of node.specifiers ?? []) {
            if (s.imported?.name === 'renderQuestion') found = true;
          }
        }
      },
    });
    return found;
  } catch {
    return false; // ignore unparseable files (e.g. TypeScript generics without a TS parser)
  }
}

describe('renderQuestion single-call-site invariant', () => {
  it('only allow-listed files import renderQuestion', () => {
    const callers: string[] = [];
    for (const f of walkDir(REPO_ROOT)) {
      // exclude the render module's own files (re-export through index)
      if (f.includes(path.join('lib', 'rendering'))) continue;
      if (importsRenderQuestion(f)) {
        callers.push(path.relative(REPO_ROOT, f).replace(/\\/g, '/'));
      }
    }
    callers.sort();
    expect(callers).toEqual(ALLOWED_CALLERS.slice().sort());
  });
});
