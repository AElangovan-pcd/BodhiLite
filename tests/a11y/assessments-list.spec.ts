import { test } from '@playwright/test';
import { createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';
import { assertNoSeriousAxeViolations } from '../helpers/axe';

test('assessments list has no serious axe violations', async ({ page, context }) => {
  const instr = await createTestUserClient({
    email: `a11y-list+${Date.now()}@test.local`, password: 'p!', role: 'instructor',
  });
  try {
    await signInBrowser(context, instr);
    await page.goto('/assessments');
    await assertNoSeriousAxeViolations(page, '/assessments');
  } finally {
    await deleteTestUser(instr.userId);
  }
});
