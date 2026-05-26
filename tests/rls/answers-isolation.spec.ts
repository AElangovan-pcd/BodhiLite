import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe('RLS: answers isolation', () => {
  const cleanupIds: string[] = [];
  test.afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id);
  });

  async function seed(): Promise<{
    sA: Awaited<ReturnType<typeof createTestUserClient>>;
    sB: Awaited<ReturnType<typeof createTestUserClient>>;
    answerId: string;
  }> {
    const admin = adminClient();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const inst = await createTestUserClient({
      email: `t25-inst-${stamp}@test.local`,
      password: 'test-pw-1!',
      role: 'instructor',
    });
    cleanupIds.push(inst.userId);
    const sA = await createTestUserClient({
      email: `t25-sa-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(sA.userId);
    const sB = await createTestUserClient({
      email: `t25-sb-${stamp}@test.local`,
      password: 'test-pw-1!',
    });
    cleanupIds.push(sB.userId);

    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: inst.userId,
        title: 'T25-A',
        slug: `t25-a-${stamp}`,
        status: 'published',
        assessment_type: 'quiz',
        default_attempts: 3,
      })
      .select('id')
      .single();
    if (!a) throw new Error('seed assess failed');
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
        student_user_id: sB.userId,
        attempt_no: 1,
        seed: 1,
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (!at) throw new Error('seed at failed');
    const { data: ans } = await admin
      .from('answers')
      .insert({
        attempt_id: at.id,
        question_id: q.id,
        rendered_question_snapshot: {
          question_id: q.id,
          question_type: 'tf',
          seed: 1,
          rendered_at: 'x',
          render: {},
        },
      })
      .select('id')
      .single();
    if (!ans) throw new Error('seed ans failed');

    return { sA, sB, answerId: ans.id };
  }

  test('student A cannot SELECT student B answers', async () => {
    const { sA, answerId } = await seed();
    const { data } = await sA.client.from('answers').select('id').eq('id', answerId);
    expect(data).toEqual([]);
  });

  test('student A cannot UPDATE student B answers (RLS scopes update)', async () => {
    const { sA, answerId } = await seed();
    const { data, error } = await sA.client
      .from('answers')
      .update({ response: { type: 'tf', value: true } })
      .eq('id', answerId)
      .select('id');
    if (!error) expect(data ?? []).toEqual([]);
  });
});
