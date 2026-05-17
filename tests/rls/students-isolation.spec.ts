import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';

test.describe('RLS: student A cannot see student B', () => {
  let instructorId: string;
  let studentAId: string;
  let studentBId: string;
  let assessmentId: string;
  let attemptBId: string;
  let answerBId: string;

  test.beforeAll(async () => {
    const admin = adminClient();

    const instructor = await createTestUserClient({
      email: `instructor+${Date.now()}@test.local`,
      password: 'test-pw-instructor-1!',
      role: 'instructor',
    });
    instructorId = instructor.userId;

    const studentA = await createTestUserClient({
      email: `studenta+${Date.now()}@test.local`,
      password: 'test-pw-studenta-1!',
    });
    studentAId = studentA.userId;

    const studentB = await createTestUserClient({
      email: `studentb+${Date.now()}@test.local`,
      password: 'test-pw-studentb-1!',
    });
    studentBId = studentB.userId;

    const { data: a, error: aErr } = await admin
      .from('assessments')
      .insert({
        owner_user_id: instructorId,
        title: 'Test quiz',
        slug: 'test-quiz',
        status: 'published',
      })
      .select()
      .single();
    if (aErr || !a) throw aErr ?? new Error('no assessment');
    assessmentId = a.id;

    const { data: q, error: qErr } = await admin
      .from('questions')
      .insert({
        assessment_id: assessmentId,
        position: 1,
        type: 'mc',
        body: { stem: '2+2?' },
        scoring: { correct: 'b' },
      })
      .select()
      .single();
    if (qErr || !q) throw qErr ?? new Error('no question');

    const { data: att, error: attErr } = await admin
      .from('attempts')
      .insert({
        assessment_id: assessmentId,
        student_user_id: studentBId,
        attempt_no: 1,
        seed: 12345,
      })
      .select()
      .single();
    if (attErr || !att) throw attErr ?? new Error('no attempt');
    attemptBId = att.id;

    const { data: ans, error: ansErr } = await admin
      .from('answers')
      .insert({
        attempt_id: attemptBId,
        question_id: q.id,
        rendered_question_snapshot: { stem: 'snapshot for B' },
        response: { choice: 'b' },
      })
      .select()
      .single();
    if (ansErr || !ans) throw ansErr ?? new Error('no answer');
    answerBId = ans.id;
  });

  test.afterAll(async () => {
    await deleteTestUser(instructorId);
    await deleteTestUser(studentAId);
    await deleteTestUser(studentBId);
  });

  test('student A cannot SELECT student B attempts', async () => {
    const { client } = await createTestUserClient({
      email: `studenta-read+${Date.now()}@test.local`,
      password: 'test-pw-1!',
    });
    const { data, error } = await client.from('attempts').select('*').eq('id', attemptBId);
    if (error) throw error;
    expect(data).toEqual([]);
  });

  test('student A cannot SELECT student B answers', async () => {
    const { client } = await createTestUserClient({
      email: `studenta-read2+${Date.now()}@test.local`,
      password: 'test-pw-1!',
    });
    const { data, error } = await client.from('answers').select('*').eq('id', answerBId);
    if (error) throw error;
    expect(data).toEqual([]);
  });
});
