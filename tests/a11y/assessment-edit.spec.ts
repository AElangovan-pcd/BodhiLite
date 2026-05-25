import { test } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';
import { assertNoSeriousAxeViolations } from '../helpers/axe';

test('assessment overview has no serious axe violations', async ({ page, context }) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `a11y-edit+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
  });
  try {
    const { data, error } = await admin.from('assessments').insert({
      owner_user_id: instr.userId, title: 'A11y', slug: `a11y-${Date.now()}`, status: 'draft',
    }).select('id').single();
    if (error || !data) throw error ?? new Error('Failed to seed assessment');
    await signInBrowser(context, instr);
    await page.goto(`/assessments/${data.id}`);
    await assertNoSeriousAxeViolations(page, '/assessments/[id]');
  } finally {
    await deleteTestUser(instr.userId);
  }
});
