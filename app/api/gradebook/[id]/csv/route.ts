import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireInstructor } from '@/lib/auth/require';
import { buildCanvasCsv, type CsvRow } from '@/lib/export/csv';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const caller = await requireInstructor();
  const supabase = await createServerSupabaseClient();

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, title')
    .eq('id', id)
    .maybeSingle();

  if (!assessment) {
    return new Response('Not found', { status: 404 });
  }

  const { data: rows } = await supabase
    .from('gradebook_rows')
    .select('student_email, best_pct')
    .eq('assessment_id', id);

  const csvRows: CsvRow[] = (rows ?? []).map((r) => ({
    email: r.student_email ?? '',
    score: r.best_pct === null ? null : Number(r.best_pct),
  }));

  const csv = buildCanvasCsv({ assessmentTitle: assessment.title, rows: csvRows });

  await supabase.from('audit_log').insert({
    actor_user_id: caller.user.id,
    action: 'csv_export',
    target_kind: 'assessment',
    target_id: id,
    after: { row_count: csvRows.length },
  });

  const slug = slugify(assessment.title);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${slug}-${dateStr}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
