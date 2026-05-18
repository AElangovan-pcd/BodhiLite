import { test, expect } from '@playwright/test';

test('sign-in page renders form and accepts email', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /send magic link/i })).toBeVisible();
});

test('sign-in page has the correct accessibility tree', async ({ page }) => {
  await page.goto('/sign-in');
  // Page has exactly one h1
  await expect(page.locator('h1')).toHaveCount(1);
  // Form input has a programmatically associated label
  const email = page.getByLabel(/email/i);
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('required', '');
});
