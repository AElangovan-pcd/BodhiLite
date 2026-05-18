import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test('rendered_question_snapshot is write-once', async () => {
  const admin = adminClient();

  const instructor = await createTestUserClient({
    email: `instr-snap+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });
  const student = await createTestUserClient({
    email: `student-snap+${Date.now()}@test.local`,
    password: 'test-pw-1!',
  });

  try {
    const { data: a } = await admin
      .from('assessments')
      .insert({
        owner_user_id: instructor.userId,
        title: 't',
        slug: 't-snap',
        status: 'published',
      })
      .select()
      .single();
    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: a!.id,
        position: 1,
        type: 'mc',
        body: {},
        scoring: {},
      })
      .select()
      .single();
    const { data: att } = await admin
      .from('attempts')
      .insert({
        assessment_id: a!.id,
        student_user_id: student.userId,
        attempt_no: 1,
        seed: 1,
      })
      .select()
      .single();

    // Student writes their snapshot the first time (allowed).
    const { error: insertErr } = await student.client.from('answers').insert({
      attempt_id: att!.id,
      question_id: q!.id,
      rendered_question_snapshot: { v: 1 },
      response: {},
    });
    expect(insertErr).toBeNull();

    // Student attempts to mutate the snapshot (must fail at the trigger level).
    const { error: updateErr } = await student.client
      .from('answers')
      .update({ rendered_question_snapshot: { v: 2 } })
      .eq('attempt_id', att!.id);
    expect(updateErr).not.toBeNull();
    expect(updateErr!.message).toMatch(/immutable/i);

    // Even the admin (service role) is blocked by the trigger.
    const { error: adminUpdateErr } = await admin
      .from('answers')
      .update({ rendered_question_snapshot: { v: 3 } })
      .eq('attempt_id', att!.id);
    expect(adminUpdateErr).not.toBeNull();
  } finally {
    await deleteTestUser(instructor.userId);
    await deleteTestUser(student.userId);
  }
});
