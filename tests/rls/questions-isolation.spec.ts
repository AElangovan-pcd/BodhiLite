import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe("RLS: instructor cannot reach another instructor's questions", () => {
  let aId: string;
  let bId: string;
  let aQuestionId: string;
  const perTestUserIds: string[] = [];

  test.beforeAll(async () => {
    const admin = adminClient();
    const a = await createTestUserClient({
      email: `instrA-q+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    const b = await createTestUserClient({
      email: `instrB-q+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    aId = a.userId;
    bId = b.userId;

    const { data: assessment, error: asmtErr } = await admin
      .from('assessments')
      .insert({
        owner_user_id: aId,
        title: 'A questions only',
        slug: `a-questions-only-${Date.now()}`,
        status: 'draft',
      })
      .select('id')
      .single();
    if (asmtErr || !assessment) throw asmtErr ?? new Error('no assessment');

    const { data: q, error: qErr } = await admin
      .from('questions')
      .insert({
        assessment_id: assessment.id,
        position: 1,
        type: 'tf',
        body: { stem: 'x' },
        scoring: { correct: true },
      })
      .select('id')
      .single();
    if (qErr || !q) throw qErr ?? new Error('no question');
    aQuestionId = q.id;
  });

  test.afterAll(async () => {
    await deleteTestUser(aId);
    await deleteTestUser(bId);
    for (const id of perTestUserIds) await deleteTestUser(id);
  });

  test('instructor B SELECTs => empty', async () => {
    const { userId, client } = await createTestUserClient({
      email: `instrB-q-read+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    perTestUserIds.push(userId);
    const { data } = await client
      .from('questions')
      .select('*')
      .eq('id', aQuestionId);
    expect(data).toEqual([]);
  });

  test('instructor B UPDATE => rejected (affects 0 rows under RLS)', async () => {
    const { userId, client } = await createTestUserClient({
      email: `instrB-q-upd+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    perTestUserIds.push(userId);
    const { data, error } = await client
      .from('questions')
      .update({ body: { stem: 'hijacked' } })
      .eq('id', aQuestionId)
      .select();
    if (error) return; // RLS may also surface as an error
    expect(data).toEqual([]);
  });

  test('instructor B DELETE => rejected (affects 0 rows)', async () => {
    const { userId, client } = await createTestUserClient({
      email: `instrB-q-del+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    perTestUserIds.push(userId);
    const { data } = await client
      .from('questions')
      .delete()
      .eq('id', aQuestionId)
      .select();
    expect(data).toEqual([]);
  });
});
