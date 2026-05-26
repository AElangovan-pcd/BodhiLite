import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('retake uses a different seed → different materialized values', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('attempt 2 materializes differently from attempt 1', async ({ page, context }) => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t29-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t29-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'Retake',
        slug: `rt-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed failed');
    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: a.id,
        position: 0,
        type: 'numeric',
        body: { stem: 'mass = {{m}}; answer m+1' },
        scoring: { formula: 'm + 1', tolerance: 0.01 },
      })
      .select('id')
      .single();
    if (!q) throw new Error('seed q failed');
    await admin.from('question_variables').insert({
      question_id: q.id,
      name: 'm',
      type: 'randint',
      position: 1,
      spec: { min: 10, max: 999 },
    });

    await signInBrowser(context, student);

    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    const stem1 = await page.locator('.prose').first().textContent();

    await page.getByLabel('Numeric answer').fill('0');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /submit attempt/i }).click();
    await page.getByRole('button', { name: /^submit( anyway)?$/i }).click();
    await page.waitForURL(/\/result$/);

    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    const stem2 = await page.locator('.prose').first().textContent();

    expect(stem2).not.toBe(stem1);
  });
});
