import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe('answers.rendered_question_snapshot is immutable (Plan 3 regression)', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('service-role UPDATE that changes snapshot raises', async () => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t25b-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const student = await createTestUserClient({
      email: `t25b-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'T25b-A',
        slug: `t25b-a-${stamp}`,
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
    const { data: at } = await admin
      .from('attempts')
      .insert({
        assessment_id: a.id,
        student_user_id: student.userId,
        attempt_no: 1,
        seed: 1,
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (!at) throw new Error('seed at failed');

    const original = {
      question_id: q.id,
      question_type: 'tf',
      seed: 1,
      rendered_at: 'x',
      render: { v: 1 },
    };
    const { data: ans } = await admin
      .from('answers')
      .insert({
        attempt_id: at.id,
        question_id: q.id,
        rendered_question_snapshot: original,
      })
      .select('id')
      .single();
    if (!ans) throw new Error('seed ans failed');

    const mutated = { ...original, render: { v: 999 } };
    const { error } = await admin
      .from('answers')
      .update({ rendered_question_snapshot: mutated })
      .eq('id', ans.id);
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/immutable/i);
  });
});
