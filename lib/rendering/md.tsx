import { Marked, type Tokens } from 'marked';
import katex from 'katex';

const marked = new Marked();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(href: string | null | undefined): string {
  if (!href) return '#';
  // Strip whitespace and control chars before scheme check (browsers tolerate them in URIs).
  const lower = href.replace(/[\s\x00-\x1f]/g, '').toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:')
  ) {
    return '#';
  }
  return href;
}

// Treat all raw HTML in markdown source as literal text — blocks every event-handler injection,
// iframe, style, svg, etc. Trade-off: authors can't embed <sup>, <br>, etc. inline. KaTeX handles
// math superscripts; the spec makes no mention of needing raw HTML in question stems.
// Also sanitize javascript:/vbscript:/data: URI schemes in markdown link and image syntax,
// which bypass the html-token renderer entirely.
marked.use({
  renderer: {
    html(token) {
      const t = token as { text?: string; raw?: string };
      return escapeHtml(t.text ?? t.raw ?? '');
    },
    link(token) {
      const t = token as { href: string; title?: string | null; tokens?: unknown[] };
      const safeHref = sanitizeUrl(t.href);
      const titleAttr = t.title ? ` title="${escapeHtml(t.title)}"` : '';
      // Render inner tokens via the parser — preserves nested markdown (bold, code, etc.) safely.
      // Falls back to escaping the raw href if tokens aren't available.
      const inner =
        (this as { parser?: { parseInline?: (toks: unknown[]) => string } }).parser?.parseInline?.(
          t.tokens ?? [],
        ) ?? escapeHtml(t.href);
      return `<a href="${escapeHtml(safeHref)}"${titleAttr}>${inner}</a>`;
    },
    image(token) {
      const t = token as { href: string; title?: string | null; text?: string };
      const safeHref = sanitizeUrl(t.href);
      const titleAttr = t.title ? ` title="${escapeHtml(t.title)}"` : '';
      const altAttr = escapeHtml(t.text ?? '');
      return `<img src="${escapeHtml(safeHref)}" alt="${altAttr}"${titleAttr}>`;
    },
  },
});

// Inline math: $ ... $ (not $$ ... $$)
marked.use({
  extensions: [
    {
      name: 'inlineMath',
      level: 'inline',
      start(src) {
        return src.indexOf('$');
      },
      tokenizer(src) {
        const m = /^\$([^$\n]+)\$/.exec(src);
        if (m) return { type: 'inlineMath', raw: m[0], text: m[1]! };
      },
      renderer(token) {
        const t = token as Tokens.Generic;
        try {
          return katex.renderToString(t.text as string, {
            output: 'htmlAndMathml',
            throwOnError: false,
          });
        } catch {
          return `<span class="math-error">${t.text}</span>`;
        }
      },
    },
    {
      name: 'blockMath',
      level: 'block',
      start(src) {
        return src.indexOf('$$');
      },
      tokenizer(src) {
        const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
        if (m) return { type: 'blockMath', raw: m[0], text: m[1]! };
      },
      renderer(token) {
        const t = token as Tokens.Generic;
        try {
          return katex.renderToString(t.text as string, {
            output: 'htmlAndMathml',
            displayMode: true,
            throwOnError: false,
          });
        } catch {
          return `<div class="math-error">${t.text}</div>`;
        }
      },
    },
  ],
});

export function Markdown({ source }: { source: string }) {
  const html = marked.parse(source, { async: false }) as string;
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
