import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe("RLS: instructor cannot reach another instructor's assessments", () => {
  let aId: string;
  let bId: string;
  let aAssessmentId: string;

  test.beforeAll(async () => {
    const admin = adminClient();
    const a = await createTestUserClient({
      email: `instrA+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    const b = await createTestUserClient({
      email: `instrB+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    aId = a.userId;
    bId = b.userId;

    const { data, error } = await admin
      .from('assessments')
      .insert({
        owner_user_id: aId,
        title: 'A only',
        slug: `a-only-${Date.now()}`,
        status: 'draft',
      })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error('no assessment');
    aAssessmentId = data.id;
  });

  test.afterAll(async () => {
    await deleteTestUser(aId);
    await deleteTestUser(bId);
  });

  test('instructor B SELECTs => empty', async () => {
    const { client } = await createTestUserClient({
      email: `instrB-read+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    const { data } = await client
      .from('assessments')
      .select('*')
      .eq('id', aAssessmentId);
    expect(data).toEqual([]);
  });

  test('instructor B UPDATE => rejected (affects 0 rows under RLS)', async () => {
    const { client } = await createTestUserClient({
      email: `instrB-upd+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    const { data, error } = await client
      .from('assessments')
      .update({ title: 'hijacked' })
      .eq('id', aAssessmentId)
      .select();
    if (error) return; // RLS may also surface as an error
    expect(data).toEqual([]);
  });

  test('instructor B DELETE => rejected (affects 0 rows)', async () => {
    const { client } = await createTestUserClient({
      email: `instrB-del+${Date.now()}@test.local`,
      password: 'p!assword1',
      role: 'instructor',
    });
    const { data } = await client
      .from('assessments')
      .delete()
      .eq('id', aAssessmentId)
      .select();
    expect(data).toEqual([]);
  });
});
