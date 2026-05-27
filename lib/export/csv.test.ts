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

describe('buildCanvasCsv — data rows', () => {
  it('writes student email in Student + SIS Login ID columns with score formatted to 2 decimals', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Quiz',
      rows: [{ email: 'jdoe@piercecollege.edu', score: 87.5 }],
    });
    expect(csv).toBe(
      'Student,SIS User ID,SIS Login ID,Quiz\n' +
        'jdoe@piercecollege.edu,,jdoe@piercecollege.edu,87.50\n',
    );
  });

  it('writes empty score cell for null', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Quiz',
      rows: [{ email: 'a@b.com', score: null }],
    });
    expect(csv).toBe(
      'Student,SIS User ID,SIS Login ID,Quiz\n' + 'a@b.com,,a@b.com,\n',
    );
  });

  it('formats 0 as 0.00', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'a@b.com', score: 0 }],
    });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Q\na@b.com,,a@b.com,0.00\n');
  });

  it('formats 100 as 100.00', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'a@b.com', score: 100 }],
    });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Q\na@b.com,,a@b.com,100.00\n');
  });

  it('writes multiple rows in order', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [
        { email: 'a@b.com', score: 87.5 },
        { email: 'c@d.com', score: null },
        { email: 'e@f.com', score: 100 },
      ],
    });
    expect(csv).toBe(
      'Student,SIS User ID,SIS Login ID,Q\n' +
        'a@b.com,,a@b.com,87.50\n' +
        'c@d.com,,c@d.com,\n' +
        'e@f.com,,e@f.com,100.00\n',
    );
  });
});

describe('buildCanvasCsv — edge cases', () => {
  it('quotes email containing a comma (unusual but RFC-correct)', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'odd,address@b.com', score: 50 }],
    });
    expect(csv).toBe(
      'Student,SIS User ID,SIS Login ID,Q\n' +
        '"odd,address@b.com",,"odd,address@b.com",50.00\n',
    );
  });

  it('quotes email containing a double-quote', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'a"b@c.com', score: 50 }],
    });
    expect(csv).toBe(
      'Student,SIS User ID,SIS Login ID,Q\n' +
        '"a""b@c.com",,"a""b@c.com",50.00\n',
    );
  });

  it('returns header-only output when rows is empty', () => {
    const csv = buildCanvasCsv({ assessmentTitle: 'Q', rows: [] });
    expect(csv).toBe('Student,SIS User ID,SIS Login ID,Q\n');
    expect(csv.split('\n').filter((line) => line.length > 0)).toHaveLength(1);
  });

  it('ends with a newline after the last row', () => {
    const csv = buildCanvasCsv({
      assessmentTitle: 'Q',
      rows: [{ email: 'a@b.com', score: 50 }],
    });
    expect(csv.endsWith('\n')).toBe(true);
  });
});
