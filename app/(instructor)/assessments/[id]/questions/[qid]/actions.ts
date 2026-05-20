'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { QuestionSchema, VariableSpecSchema } from '@/lib/schemas';
import { evaluate } from '@/lib/grading';

type SaveResult = { ok: true } | { ok: false; errors: string[] };

const PayloadSchema = z.object({
  type: z.enum(['mc', 'ma', 'tf', 'numeric', 'short_answer', 'fill_in']),
  body: z.record(z.string(), z.unknown()),
  scoring: z.record(z.string(), z.unknown()),
  variables: z.array(z.unknown()),
});

export async function saveQuestionAction(
  assessmentId: string,
  questionId: string,
  formData: FormData,
): Promise<SaveResult> {
  const rawPayload = String(formData.get('payload') ?? '');
  let parsed;
  try {
    parsed = PayloadSchema.parse(JSON.parse(rawPayload));
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }

  // Validate the question itself
  const qResult = QuestionSchema.safeParse({
    type: parsed.type,
    body: parsed.body,
    scoring: parsed.scoring,
  });
  if (!qResult.success) {
    return { ok: false, errors: qResult.error.issues.map((i) => i.message) };
  }

  // Validate each variable spec
  const varResults = parsed.variables.map((v) => VariableSpecSchema.safeParse(v));
  if (varResults.some((r) => !r.success)) {
    const msgs = varResults.flatMap((r) =>
      r.success ? [] : r.error.issues.map((i) => i.message),
    );
    return { ok: false, errors: msgs };
  }
  const variables = varResults.map((r) => r.data!);

  // Variable-name uniqueness
  const names = new Set<string>();
  for (const v of variables) {
    if (names.has(v.name)) return { ok: false, errors: [`duplicate variable: ${v.name}`] };
    names.add(v.name);
  }

  // For numeric: server-side formula parse against a fake scope of zeros
  if (parsed.type === 'numeric') {
    const formula = String((parsed.scoring as { formula?: string }).formula ?? '');
    const fakeScope: Record<string, number> = {};
    for (const v of variables) fakeScope[v.name] = 0;
    try {
      evaluate(formula, fakeScope);
    } catch (e) {
      return { ok: false, errors: [`formula error: ${(e as Error).message}`] };
    }
  }

  // Persist
  const supabase = await createServerSupabaseClient();
  const { error: qErr } = await supabase
    .from('questions')
    .update({
      body: parsed.body as unknown as Record<string, never>,
      scoring: parsed.scoring as unknown as Record<string, never>,
    })
    .eq('id', questionId);
  if (qErr) return { ok: false, errors: [qErr.message] };

  await supabase.from('question_variables').delete().eq('question_id', questionId);
  if (variables.length > 0) {
    const { error: vErr } = await supabase.from('question_variables').insert(
      variables.map((v) => ({
        question_id: questionId,
        name: v.name,
        type: v.type,
        position: v.position,
        spec: v.spec as unknown as Record<string, never>,
      })),
    );
    if (vErr) return { ok: false, errors: [vErr.message] };
  }

  revalidatePath(`/assessments/${assessmentId}/questions/${questionId}`);
  return { ok: true };
}
