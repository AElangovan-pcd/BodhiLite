import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('take page (in-progress attempt) a11y', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('no critical axe violations', async ({ page, context }) => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t26a-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t26a-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'a11y take',
        slug: `at-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 1,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed failed');
    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: a.id,
        position: 0,
        type: 'mc',
        body: {
          stem: 'Pick A',
          choices: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
        },
        scoring: { correct_id: 'a' },
      })
      .select('id')
      .single();
    if (!q) throw new Error('seed q failed');

    await signInBrowser(context, student);
    await page.goto(`/take/${a.id}`);
    await page.waitForURL(/\/attempts\//);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      ),
    ).toEqual([]);
  });
});
