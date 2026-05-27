import { describe, it, expect } from 'vitest';
import { buildCanvasCsv } from './csv';

describe('buildCanvasCsv — header row', () => {
  it('writes the four-column Canvas header', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Quiz 1', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Quiz 1\n');
  });

  it('quotes assessment title with a comma', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Quiz, the first', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,"Quiz, the first"\n');
  });

  it('quotes and escapes assessment title with an embedded quote', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Final "Easy" Quiz', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,"Final ""Easy"" Quiz"\n');
  });

  it('quotes assessment title with a newline', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Multi\nLine', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,"Multi\nLine"\n');
  });
});
