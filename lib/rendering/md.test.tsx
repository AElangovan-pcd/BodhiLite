import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown } from './md';

describe('<Markdown />', () => {
  it('renders plain markdown', () => {
    const { container } = render(<Markdown source="**bold**" />);
    expect(container.innerHTML).toContain('<strong>bold</strong>');
  });

  it('renders headings', () => {
    const { container } = render(<Markdown source="# Title" />);
    expect(container.innerHTML).toMatch(/<h1[^>]*>Title<\/h1>/);
  });

  it('renders inline math via KaTeX (MathML output)', () => {
    const { container } = render(<Markdown source="$E = mc^2$" />);
    expect(container.innerHTML).toContain('katex');
    expect(container.innerHTML).toContain('<math');
  });

  it('renders display math', () => {
    const { container } = render(<Markdown source="$$\\sum_{i=0}^n i$$" />);
    expect(container.innerHTML).toContain('katex-display');
  });

  it('escapes raw HTML in the source', () => {
    const { container } = render(<Markdown source="<script>x</script>" />);
    expect(container.innerHTML).not.toContain('<script>');
  });
});
