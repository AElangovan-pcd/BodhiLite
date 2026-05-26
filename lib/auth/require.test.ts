import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

const getUserMock = vi.fn();
const fromMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

import { requireStudent, requireInstructor } from './require';

function userRow(role: 'student' | 'instructor') {
  return { data: { role }, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireStudent', () => {
  it('returns user + role for an authenticated student', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => userRow('student') }) }),
    });
    const out = await requireStudent();
    expect(out.user.id).toBe('u1');
    expect(out.role).toBe('student');
  });

  it('returns user + role for an instructor (instructors can take quizzes)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u2' } }, error: null });
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => userRow('instructor') }) }),
    });
    const out = await requireStudent();
    expect(out.role).toBe('instructor');
  });

  it('redirects to /sign-in when unauthenticated', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(requireStudent()).rejects.toThrow('REDIRECT:/sign-in');
  });
});

describe('requireInstructor', () => {
  it('returns user when role=instructor', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'i1' } }, error: null });
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => userRow('instructor') }) }),
    });
    const out = await requireInstructor();
    expect(out.user.id).toBe('i1');
  });

  it('notFound() when role=student (do not reveal route shape)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 's1' } }, error: null });
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => userRow('student') }) }),
    });
    await expect(requireInstructor()).rejects.toThrow('NOT_FOUND');
  });

  it('redirects to /sign-in when unauthenticated', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(requireInstructor()).rejects.toThrow('REDIRECT:/sign-in');
  });
});
