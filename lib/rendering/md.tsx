import { Marked, type Tokens } from 'marked';
import katex from 'katex';

const marked = new Marked();

// Strip <script> tags — marked v18 does not sanitize raw HTML by default.
marked.use({
  hooks: {
    postprocess(html) {
      return html.replace(/<script[\s\S]*?<\/script>/gi, '');
    },
  },
});

// Inline math: $ ... $ (not $$ ... $$)
marked.use({
  extensions: [
    {
      name: 'inlineMath',
      level: 'inline',
      start(src) { return src.indexOf('$'); },
      tokenizer(src) {
        const m = /^\$([^$\n]+)\$/.exec(src);
        if (m) return { type: 'inlineMath', raw: m[0], text: m[1]! };
      },
      renderer(token) {
        const t = token as Tokens.Generic;
        try {
          return katex.renderToString(t.text as string, { output: 'htmlAndMathml', throwOnError: false });
        } catch {
          return `<span class="math-error">${t.text}</span>`;
        }
      },
    },
    {
      name: 'blockMath',
      level: 'block',
      start(src) { return src.indexOf('$$'); },
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
