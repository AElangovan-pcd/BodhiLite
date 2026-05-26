import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('result page a11y', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('no critical violations on a seeded submitted attempt', async ({ page, context }) => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t26b-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t26b-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'a11y result',
        slug: `ar-${stamp}`,
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
        type: 'tf',
        body: { stem: 'T?' },
        scoring: { correct: true },
      })
      .select('id')
      .single();
    if (!q) throw new Error('seed q failed');

    const snap = {
      question_id: q.id,
      question_type: 'tf',
      seed: 1,
      rendered_at: 'x',
      render: {
        materialized_values: {},
        rendered_stem: 'T?',
        rendered_body: { kind: 'tf' },
        grading_target: { kind: 'tf', correct: true },
        validation_errors: [],
      },
    };
    const { data: at } = await admin
      .from('attempts')
      .insert({
        assessment_id: a.id,
        student_user_id: student.userId,
        attempt_no: 1,
        seed: 1,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        summary: { raw_score: 1, max_score: 1, percentage: 100 },
      })
      .select('id')
      .single();
    if (!at) throw new Error('seed at failed');
    await admin.from('answers').insert({
      attempt_id: at.id,
      question_id: q.id,
      rendered_question_snapshot: snap,
      response: { type: 'tf', value: true },
      auto_score: 1,
      score_method: 'auto',
      graded_at: new Date().toISOString(),
    });

    await signInBrowser(context, student);
    await page.goto(`/attempts/${at.id}/result`);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([]);
  });
});
