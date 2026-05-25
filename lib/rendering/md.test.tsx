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

  it('treats raw HTML as literal text, not markup', () => {
    const { container } = render(<Markdown source="<script>x</script>" />);
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });

  it('blocks event-handler injection via raw img tag', () => {
    const { container } = render(<Markdown source="<img src=x onerror=alert(1)>" />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('blocks svg onload injection', () => {
    const { container } = render(<Markdown source="<svg onload=alert(1)>" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('sanitizes javascript: hrefs in markdown links', () => {
    const { container } = render(<Markdown source="[click](javascript:alert(1))" />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('#');
  });

  it('sanitizes javascript: src in markdown images', () => {
    const { container } = render(<Markdown source="![alt](javascript:alert(1))" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('#');
  });
});
