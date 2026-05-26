import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe('submit_attempt is idempotent (cannot submit twice)', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('second submit_attempt call raises', async () => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t25c-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t25c-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'T25c-A',
        slug: `t25c-a-${stamp}`,
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
        body: { stem: 'T' },
        scoring: { correct: true },
      })
      .select('id')
      .single();
    if (!q) throw new Error('seed q failed');

    const snapshots = [
      {
        question_id: q.id,
        snapshot: {
          question_id: q.id,
          question_type: 'tf',
          seed: 1,
          rendered_at: 'x',
          render: { grading_target: { kind: 'tf', correct: true } },
        },
      },
    ];
    const { data: aid } = await student.client.rpc('start_attempt', {
      p_assessment_id: a.id,
      p_student_user_id: student.userId,
      p_attempt_no: 1,
      p_seed: 1,
      p_snapshots: snapshots,
    });
    if (!aid) throw new Error('start_attempt failed');

    const { error: e1 } = await student.client.rpc('submit_attempt', {
      p_attempt_id: aid,
      p_grades: [{ question_id: q.id, auto_score: 1, score_method: 'auto' }],
      p_summary: { raw_score: 1, max_score: 1, percentage: 100 },
    });
    expect(e1).toBeNull();

    const { error: e2 } = await student.client.rpc('submit_attempt', {
      p_attempt_id: aid,
      p_grades: [{ question_id: q.id, auto_score: 0, score_method: 'auto' }],
      p_summary: { raw_score: 0, max_score: 1, percentage: 0 },
    });
    expect(e2).not.toBeNull();
  });
});
