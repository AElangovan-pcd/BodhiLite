import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBrowserSupabaseClient } from './client';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-test');
});

describe('createBrowserSupabaseClient', () => {
  it('returns a client with auth and from()', () => {
    const c = createBrowserSupabaseClient();
    expect(c.auth).toBeDefined();
    expect(typeof c.from).toBe('function');
  });

  it('throws if SUPABASE_URL is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(() => createBrowserSupabaseClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
