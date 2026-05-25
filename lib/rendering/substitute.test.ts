import { describe, it, expect } from 'vitest';
import { substitute } from './substitute';

describe('substitute', () => {
  it('replaces a single variable', () => {
    expect(substitute('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
  });

  it('replaces multiple variables', () => {
    expect(substitute('{{a}} + {{b}}', { a: '1', b: '2' })).toBe('1 + 2');
  });

  it('substitutes numeric values', () => {
    expect(substitute('Mass: {{m}} g', { m: 42 })).toBe('Mass: 42 g');
  });

  it('substitutes compound values by label', () => {
    const c = { label: 'NaCl', smiles: '[Na+].[Cl-]' };
    expect(substitute('Dissolve {{salt}}', { salt: c })).toBe('Dissolve NaCl');
  });

  it('HTML-escapes variable values', () => {
    expect(substitute('Hi {{x}}', { x: '<script>alert(1)</script>' })).toBe(
      'Hi &lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('leaves unrecognized {{x}} alone (no var)', () => {
    expect(substitute('No {{missing}} here', {})).toBe('No {{missing}} here');
  });

  it('leaves blank tokens {{blank:id}} alone (handled later)', () => {
    expect(substitute('Fill {{blank:x}}', { blank: 'something' })).toBe('Fill {{blank:x}}');
  });
});
