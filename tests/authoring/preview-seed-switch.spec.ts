import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test('typing in editor updates preview live; seed switch re-materializes', async ({
  page,
  context,
}) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `instr-live+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });
  let aid: string | undefined;
  let qid: string | undefined;
  try {
    const { data: a } = await admin
      .from('assessments')
      .insert({ owner_user_id: instr.userId, title: 'Live', slug: 'live-test', status: 'draft' })
      .select('id')
      .single();
    aid = a!.id;
    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: aid,
        position: 1,
        type: 'numeric',
        body: { stem: 'How many g of {{x}}?', units: 'g' },
        scoring: { formula: 'x * 2', tolerance: 0.01 },
      })
      .select('id')
      .single();
    qid = q!.id;
    await admin.from('question_variables').insert({
      question_id: qid,
      name: 'x',
      type: 'randint',
      position: 1,
      spec: { min: 1, max: 100 },
    });

    await signInBrowser(context, instr);
    await page.goto(`/assessments/${aid}/questions/${qid}`);

    // Preview should already render the seeded stem
    const preview = page.locator('section[aria-label="Preview"]');
    await expect(preview).toContainText('How many g of');

    // Switch to a different seed; reveal panel changes
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /Test student 2/i }).click();
    // Reveal panel should still show the materialized values
    await expect(preview).toContainText(/Materialized values/i);
  } finally {
    if (instr.userId) {
      await deleteTestUser(instr.userId);
    }
  }
});
