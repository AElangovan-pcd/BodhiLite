import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('student resume in-progress attempt', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('navigates back to same /attempts/[aid] and restores response', async ({
    page,
    context,
  }) => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t28-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t28-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'Resume',
        slug: `r-${stamp}`,
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
        stem: 'pick',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
      scoring: { correct_id: 'a' },
    });

    await signInBrowser(context, student);
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    const url1 = page.url();
    await page.getByLabel('A').click();

    await page.waitForTimeout(1200);

    await page.goto('/');
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    expect(page.url()).toBe(url1);
    await expect(page.getByLabel('A')).toBeChecked();
  });
});
