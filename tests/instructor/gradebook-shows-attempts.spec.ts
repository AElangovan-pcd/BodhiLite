import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('instructor gradebook shows submitted attempts', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('two students with attempts both appear with best scores', async ({ page, context }) => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t30-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const s1Email = `t30-s1-${stamp}@test.local`;
    const s2Email = `t30-s2-${stamp}@test.local`;
    const s1 = await createTestUserClient({ email: s1Email, password: 'test-pw-1!' });
    cleanupIds.push(s1.userId);
    const s2 = await createTestUserClient({ email: s2Email, password: 'test-pw-1!' });
    cleanupIds.push(s2.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'GB E2E',
        slug: `gbe-${stamp}`,
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
        type: 'tf',
        body: { stem: 'T?' },
        scoring: { correct: true },
      })
      .select('id')
      .single();
    if (!q) throw new Error('seed q failed');

    const snap = (correct: boolean) => ({
      question_id: q.id,
      question_type: 'tf',
      seed: 1,
      rendered_at: 'x',
      render: {
        materialized_values: {},
        rendered_stem: 'T?',
        rendered_body: { kind: 'tf' },
        grading_target: { kind: 'tf', correct },
        validation_errors: [],
      },
    });

    for (const { sid, score, raw } of [
      { sid: s1.userId, score: 1, raw: snap(true) },
      { sid: s2.userId, score: 0, raw: snap(true) },
    ]) {
      const { data: at } = await admin
        .from('attempts')
        .insert({
          assessment_id: a.id,
          student_user_id: sid,
          attempt_no: 1,
          seed: 1,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          summary: { raw_score: score, max_score: 1, percentage: score * 100 },
        })
        .select('id')
        .single();
      if (!at) throw new Error('seed at failed');
      await admin.from('answers').insert({
        attempt_id: at.id,
        question_id: q.id,
        rendered_question_snapshot: raw,
        response: { type: 'tf', value: score === 1 },
        auto_score: score,
        score_method: 'auto',
        graded_at: new Date().toISOString(),
      });
    }

    await signInBrowser(context, inst);
    await page.goto(`/assessments/${a.id}/attempts`);

    await expect(page.getByText(s1Email)).toBeVisible();
    await expect(page.getByText(s2Email)).toBeVisible();
    await expect(page.getByRole('cell', { name: '100.00%', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: '0.00%', exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'View best' }).first().click();
    await page.waitForURL(/\/assessments\/.+\/attempts\/.+/);
    await expect(page.getByText(/attempt 1 by/i)).toBeVisible();
  });
});
