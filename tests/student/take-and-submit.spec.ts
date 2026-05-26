import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('student take + submit happy path', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('answer one mc question, submit, see score and reveal', async ({ page, context }) => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t27-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t27-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'E2E take',
        slug: `tas-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed failed');
    await admin.from('questions').insert({
      assessment_id: a.id,
      position: 0,
      type: 'mc',
      body: {
        stem: 'What is 2+2?',
        choices: [
          { id: 'a', label: '3' },
          { id: 'b', label: '4' },
          { id: 'c', label: '5' },
        ],
      },
      scoring: { correct_id: 'b' },
    });

    await signInBrowser(context, student);
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);

    await page.getByLabel('4').click();
    // Wait for the per-card autosave (500ms debounce) to commit before submitting,
    // otherwise submit races the save and grades the row as unanswered.
    await page.waitForTimeout(1200);

    await page.getByRole('button', { name: /submit attempt/i }).click();
    await page.getByRole('button', { name: /^submit$/i }).click();

    await page.waitForURL(/\/result$/);
    await expect(page.getByText('1 / 1')).toBeVisible();
    await expect(page.getByText(/correct answer/i)).toBeVisible();
  });
});
