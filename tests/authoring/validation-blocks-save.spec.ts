import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test('invalid form blocks save with field-level error', async ({ page, context }) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `instr-val+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });
  try {
    const { data: a } = await admin
      .from('assessments')
      .insert({ owner_user_id: instr.userId, title: 'V', slug: 'val', status: 'draft' })
      .select('id').single();
    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: a!.id, position: 1, type: 'numeric',
        body: { stem: 'x' }, scoring: { formula: '0', tolerance: 0 },
      })
      .select('id').single();

    await signInBrowser(context, instr);
    await page.goto(`/assessments/${a!.id}/questions/${q!.id}`);

    // Set tolerance negative — this will fail NumericScoring validation (min(0))
    await page.getByLabel(/Tolerance/i).fill('-1');
    await page.getByRole('button', { name: /^Save$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/tolerance/i);
  } finally {
    await deleteTestUser(instr.userId);
  }
});
