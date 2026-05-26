import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('gradebook page a11y', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('no critical violations', async ({ page, context }) => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t26c-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'a11y gb',
        slug: `gb-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed failed');

    await signInBrowser(context, inst);
    await page.goto(`/assessments/${a.id}/attempts`);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      ),
    ).toEqual([]);
  });
});
