import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('CSV export — RLS isolation', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test("instructor A cannot CSV-export instructor B's assessment (404, not 403, no leak)", async ({
    page,
    context,
  }) => {
    const admin = adminClient();
    const stamp = Date.now();

    const instA = await createTestUserClient({
      email: `t11-instA-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(instA.userId);
    const instB = await createTestUserClient({
      email: `t11-instB-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(instB.userId);

    // Assessment owned by B.
    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: instB.userId,
        title: 'B-owned Quiz',
        slug: `b-owned-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed assessment failed');

    // Sign in as INSTRUCTOR A.
    await signInBrowser(context, instA);
    const res = await page.request.get(`/api/gradebook/${a.id}/csv`);
    expect(res.status()).toBe(404);
    expect(await res.text()).toBe('Not found');
  });

  test('student cannot hit the route at all', async ({ page, context }) => {
    const admin = adminClient();
    const stamp = Date.now();

    const inst = await createTestUserClient({
      email: `t11-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t11-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'Q',
        slug: `q-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed assessment failed');

    await signInBrowser(context, student);
    const res = await page.request.get(`/api/gradebook/${a.id}/csv`);
    // requireInstructor() throws → Next renders an error response. Expect non-200.
    expect(res.status()).not.toBe(200);
  });
});
