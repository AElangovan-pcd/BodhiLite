import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/require', () => ({
  requireInstructor: vi.fn(),
}));

import { GET } from './route';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireInstructor } from '@/lib/auth/require';
import type { User } from '@supabase/supabase-js';

function makeRequest(): Request {
  return new Request('http://localhost/api/gradebook/asmt-1/csv');
}

function mockSupabase(impl: {
  assessment: { id: string; title: string } | null;
  rows: Array<{ student_email: string; best_pct: number | null }>;
  auditOk?: boolean;
}) {
  const fromMock = vi.fn((table: string) => {
    if (table === 'assessments') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: impl.assessment, error: null }),
      };
    }
    if (table === 'gradebook_rows') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: impl.rows, error: null }),
      };
    }
    if (table === 'audit_log') {
      return {
        insert: vi
          .fn()
          .mockResolvedValue({ error: impl.auditOk === false ? new Error('audit fail') : null }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock };
}

describe('GET /api/gradebook/[id]/csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns CSV for an instructor-owned assessment', async () => {
    vi.mocked(requireInstructor).mockResolvedValue({
      user: { id: 'inst-1', email: 'i@p.edu' } as User,
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({
        assessment: { id: 'asmt-1', title: 'Quiz 1' },
        rows: [
          { student_email: 'a@b.com', best_pct: 87.5 },
          { student_email: 'c@d.com', best_pct: null },
        ],
      }) as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-1' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="quiz-1-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const body = await res.text();
    expect(body).toBe(
      'Student,SIS User ID,SIS Login ID,Quiz 1\n' +
        'a@b.com,,a@b.com,87.50\n' +
        'c@d.com,,c@d.com,\n',
    );
  });
});

describe('GET /api/gradebook/[id]/csv — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the assessment is not found or not owned by caller', async () => {
    vi.mocked(requireInstructor).mockResolvedValue({
      user: { id: 'inst-1', email: 'i@p.edu', role: 'instructor' },
    } as unknown as Awaited<ReturnType<typeof requireInstructor>>);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({ assessment: null, rows: [] }) as unknown as Awaited<
        ReturnType<typeof createServerSupabaseClient>
      >,
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-missing' }) });

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
  });

  it('returns header-only CSV when assessment exists but has no rows', async () => {
    vi.mocked(requireInstructor).mockResolvedValue({
      user: { id: 'inst-1', email: 'i@p.edu', role: 'instructor' },
    } as unknown as Awaited<ReturnType<typeof requireInstructor>>);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({
        assessment: { id: 'asmt-1', title: 'Empty Quiz' },
        rows: [],
      }) as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-1' }) });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Student,SIS User ID,SIS Login ID,Empty Quiz\n');
  });

  it('returns 200 even when audit_log insert fails (best-effort)', async () => {
    vi.mocked(requireInstructor).mockResolvedValue({
      user: { id: 'inst-1', email: 'i@p.edu', role: 'instructor' },
    } as unknown as Awaited<ReturnType<typeof requireInstructor>>);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({
        assessment: { id: 'asmt-1', title: 'Quiz' },
        rows: [{ student_email: 'a@b.com', best_pct: 50 }],
        auditOk: false,
      }) as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-1' }) });

    expect(res.status).toBe(200);
  });

  it('propagates errors from requireInstructor by rethrowing (auth helper handles redirects)', async () => {
    vi.mocked(requireInstructor).mockRejectedValue(new Error('redirect'));
    await expect(GET(makeRequest(), { params: Promise.resolve({ id: 'asmt-1' }) })).rejects.toThrow(
      'redirect',
    );
  });
});
