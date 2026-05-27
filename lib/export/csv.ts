export type CsvRow = {
  /** Pierce email — used as both the `Student` column (cosmetic) and the `SIS Login ID` column (Canvas match key). */
  email: string;
  /** null = not submitted yet (empty cell). number = best percentage in [0, 100], rendered as fixed-2-decimal. */
  score: number | null;
};

const NEEDS_QUOTE = /[",\n]/;

function rfc4180(value: string): string {
  if (!NEEDS_QUOTE.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCanvasCsv(args: { assessmentTitle: string; rows: CsvRow[] }): string {
  const { assessmentTitle, rows } = args;
  const header = `Student,SIS User ID,SIS Login ID,${rfc4180(assessmentTitle)}\n`;
  const body = rows
    .map((row) => {
      const email = rfc4180(row.email);
      const scoreStr = row.score === null ? '' : row.score.toFixed(2);
      return `${email},,${email},${scoreStr}\n`;
    })
    .join('');
  return header + body;
}
