import { test, expect } from '@playwright/test';
import { createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test('instructor can create an assessment', async ({ page, context }) => {
  const instr = await createTestUserClient({
    email: `instr-create+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });

  try {
    await signInBrowser(context, instr);
    await page.goto('/assessments/new');
    await page.getByLabel(/title/i).fill('Stoichiometry Practice');
    await page.getByLabel(/slug/i).fill('stoich-practice');
    await page.getByLabel(/type/i).selectOption('quiz');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/assessments\/[a-f0-9-]+$/);
    await expect(page.getByRole('heading', { name: /stoichiometry practice/i })).toBeVisible();
  } finally {
    await deleteTestUser(instr.userId);
  }
});
