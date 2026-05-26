import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe('RLS: attempts cross-user + cross-instructor isolation', () => {
  const cleanupIds: string[] = [];

  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  test('student A cannot SELECT student B attempts', async () => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t24-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const sA = await createTestUserClient({
      email: `t24-sa-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(sA.userId);
    const sB = await createTestUserClient({
      email: `t24-sb-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(sB.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'T24-A',
        slug: `t24-a-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed failed');

    const { data: at } = await admin
      .from('attempts')
      .insert({
        assessment_id: a.id,
        student_user_id: sB.userId,
        attempt_no: 1,
        seed: 1,
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (!at) throw new Error('seed attempt failed');

    const { data: visible } = await sA.client.from('attempts').select('id').eq('id', at.id);
    expect(visible).toEqual([]);
  });

  test('student A cannot INSERT attempt with student_user_id = B', async () => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst = await createTestUserClient({
      email: `t24b-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const sA = await createTestUserClient({
      email: `t24b-sa-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(sA.userId);
    const sB = await createTestUserClient({
      email: `t24b-sb-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(sB.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'T24b-A',
        slug: `t24b-a-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed failed');

    const { error } = await sA.client.from('attempts').insert({
      assessment_id: a.id,
      student_user_id: sB.userId,
      attempt_no: 1,
      seed: 1,
      status: 'in_progress',
    });
    expect(error).not.toBeNull();
  });

  test('instructor cannot read attempts on non-owned assessment', async () => {
    const admin = adminClient();
    const stamp = Date.now();
    const inst1 = await createTestUserClient({
      email: `t24c-i1-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst1.userId);
    const inst2 = await createTestUserClient({
      email: `t24c-i2-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst2.userId);
    const student = await createTestUserClient({
      email: `t24c-s-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(student.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst1.userId,
        title: 'T24c-A',
        slug: `t24c-a-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed failed');

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
    if (!at) throw new Error('seed attempt failed');

    const { data } = await inst2.client.from('attempts').select('id').eq('id', at.id);
    expect(data).toEqual([]);
  });
});
