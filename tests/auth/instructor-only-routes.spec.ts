import { test, expect } from '@playwright/test';
import { createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('instructor route gate', () => {
  test('unauthenticated user is redirected to sign-in', async ({ page }) => {
    await page.goto('/assessments');
    expect(page.url()).toContain('/sign-in');
  });

  test('authenticated student gets 404', async ({ page, context }) => {
    const student = await createTestUserClient({
      email: `student-gate+${Date.now()}@test.local`,
      password: 'test-pw-1!',
    });
    try {
      await signInBrowser(context, student);
      const resp = await page.goto('/assessments');
      expect(resp?.status()).toBe(404);
    } finally {
      await deleteTestUser(student.userId);
    }
  });

  test('authenticated instructor sees the page', async ({ page, context }) => {
    const instructor = await createTestUserClient({
      email: `instr-gate+${Date.now()}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    try {
      await signInBrowser(context, instructor);
      await page.goto('/assessments');
      // The page exists (200), even if empty
      await expect(page.getByRole('heading', { name: /assessments/i })).toBeVisible();
    } finally {
      await deleteTestUser(instructor.userId);
    }
  });
});
