import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('Gradebook page a11y (with CSV download button)', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  async function seedAssessmentWithOneAttempt(stamp: number) {
    const admin = adminClient();
    const inst = await createTestUserClient({
      email: `t12-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t12-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'A11y Test Quiz',
        slug: `a11y-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed assessment failed');

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
    if (!q) throw new Error('seed question failed');

    const { data: at } = await admin
      .from('attempts')
      .insert({
        assessment_id: a.id,
        student_user_id: student.userId,
        attempt_no: 1,
        seed: 1,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        summary: { raw_score: 0.75, max_score: 1, percentage: 75 },
      })
      .select('id')
      .single();
    if (!at) throw new Error('seed attempt failed');
    await admin.from('answers').insert({
      attempt_id: at.id,
      question_id: q.id,
      rendered_question_snapshot: {
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
      },
      response: { type: 'tf', value: true },
      auto_score: 0.75,
      score_method: 'auto',
      graded_at: new Date().toISOString(),
    });

    return { inst, assessmentId: a.id };
  }

  test('passes axe-core WCAG 2.2 AA scan', async ({ page, context }) => {
    const { inst, assessmentId } = await seedAssessmentWithOneAttempt(Date.now());
    await signInBrowser(context, inst);
    await page.goto(`/assessments/${assessmentId}/attempts`);
    await page.getByRole('button', { name: /download gradebook csv/i }).waitFor();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('download button is keyboard-focusable with a visible focus indicator', async ({
    page,
    context,
  }) => {
    const { inst, assessmentId } = await seedAssessmentWithOneAttempt(Date.now() + 1);
    await signInBrowser(context, inst);
    await page.goto(`/assessments/${assessmentId}/attempts`);

    const button = page.getByRole('button', { name: /download gradebook csv/i });
    await button.focus();
    await expect(button).toBeFocused();

    const outline = await button.evaluate((el) => getComputedStyle(el).outlineStyle);
    const boxShadow = await button.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(outline !== 'none' || boxShadow !== 'none').toBe(true);
  });
});
