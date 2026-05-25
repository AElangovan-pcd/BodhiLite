import { test } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';
import { assertNoSeriousAxeViolations } from '../helpers/axe';

test('question editor has no serious axe violations', async ({ page, context }) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `a11y-qedit+${Date.now()}@test.local`,
    password: 'p!',
    role: 'instructor',
  });
  try {
    const { data: a, error: aErr } = await admin
      .from('assessments')
      .insert({
        owner_user_id: instr.userId,
        title: 'Q',
        slug: `q-${Date.now()}`,
        status: 'draft',
      })
      .select('id')
      .single();
    if (aErr || !a) throw aErr ?? new Error('Failed to seed assessment');
    const { data: q, error: qErr } = await admin
      .from('questions')
      .insert({
        assessment_id: a.id,
        position: 1,
        type: 'numeric',
        body: { stem: 'How many g of {{x}}?' },
        scoring: { formula: 'x * 2', tolerance: 0.01 },
      })
      .select('id')
      .single();
    if (qErr || !q) throw qErr ?? new Error('Failed to seed question');
    await admin.from('question_variables').insert({
      question_id: q.id,
      name: 'x',
      type: 'randint',
      position: 1,
      spec: { min: 1, max: 10 },
    });
    await signInBrowser(context, instr);
    await page.goto(`/assessments/${a.id}/questions/${q.id}`);
    await assertNoSeriousAxeViolations(page, '/assessments/[id]/questions/[qid]');
  } finally {
    await deleteTestUser(instr.userId);
  }
});
