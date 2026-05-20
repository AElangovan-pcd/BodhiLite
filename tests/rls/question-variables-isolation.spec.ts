import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe("RLS: instructor cannot reach another instructor's question_variables", () => {
  let aId: string;
  let bId: string;
  let aVariableId: string;

  test.beforeAll(async () => {
    const admin = adminClient();
    const a = await createTestUserClient({
      email: `instrA-v+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    const b = await createTestUserClient({
      email: `instrB-v+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    aId = a.userId;
    bId = b.userId;

    const { data: assessment, error: asmtErr } = await admin
      .from('assessments')
      .insert({
        owner_user_id: aId,
        title: 'A variables only',
        slug: `a-variables-only-${Date.now()}`,
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

    const { data: v, error: vErr } = await admin
      .from('question_variables')
      .insert({
        question_id: q.id,
        name: 'x',
        type: 'randint',
        position: 1,
        spec: { min: 1, max: 5 },
      })
      .select('id')
      .single();
    if (vErr || !v) throw vErr ?? new Error('no question_variable');
    aVariableId = v.id;
  });

  test.afterAll(async () => {
    await deleteTestUser(aId);
    await deleteTestUser(bId);
  });

  test('instructor B SELECTs => empty', async () => {
    const { client } = await createTestUserClient({
      email: `instrB-v-read+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    const { data } = await client
      .from('question_variables')
      .select('*')
      .eq('id', aVariableId);
    expect(data).toEqual([]);
  });

  test('instructor B UPDATE => rejected (affects 0 rows under RLS)', async () => {
    const { client } = await createTestUserClient({
      email: `instrB-v-upd+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    const { data, error } = await client
      .from('question_variables')
      .update({ spec: { min: 99, max: 100 } })
      .eq('id', aVariableId)
      .select();
    if (error) return; // RLS may also surface as an error
    expect(data).toEqual([]);
  });

  test('instructor B DELETE => rejected (affects 0 rows)', async () => {
    const { client } = await createTestUserClient({
      email: `instrB-v-del+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    const { data } = await client
      .from('question_variables')
      .delete()
      .eq('id', aVariableId)
      .select();
    expect(data).toEqual([]);
  });
});
