import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test('audit_log rejects UPDATE and DELETE', async () => {
  const admin = adminClient();
  const instructor = await createTestUserClient({
    email: `instr-audit+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });

  try {
    const { data: row, error: insertErr } = await admin
      .from('audit_log')
      .insert({
        actor_user_id: instructor.userId,
        action: 'TEST_EVENT',
        target_kind: 'test',
        target_id: null,
        before: null,
        after: { foo: 'bar' },
      })
      .select()
      .single();
    expect(insertErr).toBeNull();
    expect(row).toBeTruthy();

    const { error: updateErr } = await admin
      .from('audit_log')
      .update({ action: 'CHANGED' })
      .eq('id', row!.id);
    expect(updateErr).not.toBeNull();

    const { error: deleteErr } = await admin.from('audit_log').delete().eq('id', row!.id);
    expect(deleteErr).not.toBeNull();
  } finally {
    await deleteTestUser(instructor.userId);
  }
});
