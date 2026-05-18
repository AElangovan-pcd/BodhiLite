import { test } from '@playwright/test';
import { assertNoSeriousAxeViolations } from '../helpers/axe';

test('sign-in page has no serious/critical axe violations', async ({ page }) => {
  await page.goto('/sign-in');
  await assertNoSeriousAxeViolations(page, '/sign-in');
});

test('sign-in page with success banner has no serious/critical axe violations', async ({
  page,
}) => {
  await page.goto('/sign-in?sent=1');
  await assertNoSeriousAxeViolations(page, '/sign-in?sent=1');
});

test('sign-in page with error banner has no serious/critical axe violations', async ({ page }) => {
  await page.goto('/sign-in?error=Something%20broke');
  await assertNoSeriousAxeViolations(page, '/sign-in?error=...');
});
