import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test.describe('CSV export', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('instructor downloads Canvas-import-compatible CSV from gradebook page', async ({
    page,
    context,
  }) => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t10-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const s1Email = `t10-s1-${stamp}@test.local`;
    const s2Email = `t10-s2-${stamp}@test.local`;
    const s3Email = `t10-s3-${stamp}@test.local`;
    const s1 = await createTestUserClient({ email: s1Email, password: 'test-pw-1!' });
    cleanupIds.push(s1.userId);
    const s2 = await createTestUserClient({ email: s2Email, password: 'test-pw-1!' });
    cleanupIds.push(s2.userId);
    const s3 = await createTestUserClient({ email: s3Email, password: 'test-pw-1!' });
    cleanupIds.push(s3.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'CSV Export Test Quiz',
        slug: `csv-test-${stamp}`,
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

    // s1 = 87.5%, s2 = null (no submission), s3 = 100%.
    for (const { sid, pct } of [
      { sid: s1.userId, pct: 87.5 },
      { sid: s3.userId, pct: 100 },
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
          summary: { raw_score: pct / 100, max_score: 1, percentage: pct },
        })
        .select('id')
        .single();
      if (!at) throw new Error('seed attempt failed');
      await admin.from('answers').insert({
        attempt_id: at.id,
        question_id: q.id,
        rendered_question_snapshot: snap(true),
        response: { type: 'tf', value: pct > 50 },
        auto_score: pct / 100,
        score_method: 'auto',
        graded_at: new Date().toISOString(),
      });
    }

    await signInBrowser(context, inst);
    await page.goto(`/assessments/${a.id}/attempts`);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download gradebook csv/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^csv-export-test-quiz-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    const path = await download.path();
    if (!path) throw new Error('download path missing');
    const fs = await import('node:fs/promises');
    const body = await fs.readFile(path, 'utf-8');

    const lines = body.split('\n');
    expect(lines[0]).toBe('Student,SIS User ID,SIS Login ID,CSV Export Test Quiz');
    expect(lines).toContain(`${s1Email},,${s1Email},87.50`);
    expect(lines).toContain(`${s3Email},,${s3Email},100.00`);
    // s2 did not submit; should not appear in gradebook_rows output.
    expect(body).not.toContain(s2Email);
  });
});
