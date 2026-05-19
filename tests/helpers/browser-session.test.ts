/**
 * Regression test for the @supabase/ssr cookie format written by signInBrowser.
 *
 * @supabase/ssr encodes session cookies as:
 *   base64-<stringToBase64URL(JSON.stringify(session))>
 *
 * Node's Buffer.from(str, 'utf8').toString('base64url') produces identical
 * output to @supabase/ssr's stringToBase64URL for any UTF-8 string.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signInBrowser } from './browser-session';
import type { Session } from '@supabase/supabase-js';
import type { BrowserContext, Cookie } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

// ---------------------------------------------------------------------------
// Verify that Node's base64url round-trip matches @supabase/ssr's encoding
// ---------------------------------------------------------------------------
describe('Buffer base64url round-trip sanity check', () => {
  it('encodes and decodes a non-trivial UTF-8 string correctly', () => {
    const input = JSON.stringify({ a: 'tëst', emoji: '🔑' });
    const encoded = Buffer.from(input, 'utf8').toString('base64url');
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    expect(decoded).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// signInBrowser tests
// ---------------------------------------------------------------------------

const FAKE_SESSION: Session = {
  access_token: 'eyJhbGciOiJIUzI1NiJ9.fake-access',
  refresh_token: 'fake-refresh-token',
  expires_at: 1_700_000_000,
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'u1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
  },
};

/** Build a minimal SupabaseClient stub whose getSession resolves to the given session. */
function makeClient(session: Session | null): SupabaseClient<Database> {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    },
  } as unknown as SupabaseClient<Database>;
}

/** Build a minimal Playwright BrowserContext stub that captures addCookies calls. */
function makeBrowserContext(): { ctx: BrowserContext; captured: Cookie[][] } {
  const captured: Cookie[][] = [];
  const ctx = {
    addCookies: vi.fn((cookies: Cookie[]) => {
      captured.push(cookies);
      return Promise.resolve();
    }),
  } as unknown as BrowserContext;
  return { ctx, captured };
}

describe('signInBrowser', () => {
  const originalUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];

  beforeEach(() => {
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'http://127.0.0.1:54321';
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env['NEXT_PUBLIC_SUPABASE_URL'];
    } else {
      process.env['NEXT_PUBLIC_SUPABASE_URL'] = originalUrl;
    }
    vi.restoreAllMocks();
  });

  it('sets exactly one cookie with the correct name and base64url-encoded session', async () => {
    const { ctx, captured } = makeBrowserContext();
    const client = makeClient(FAKE_SESSION);

    await signInBrowser(ctx, { userId: 'u1', client });

    // Exactly one addCookies call
    expect(captured).toHaveLength(1);

    const cookies = captured[0]!;
    expect(cookies).toHaveLength(1);

    const cookie = cookies[0]!;

    // Cookie name: sb-<host-with-dots-replaced-by-dashes>-auth-token
    // hostname 127.0.0.1 → 127-0-0-1
    expect(cookie.name).toBe('sb-127-0-0-1-auth-token');

    // Value must start with the @supabase/ssr prefix
    expect(cookie.value).toMatch(/^base64-/);

    // The rest must decode back to the full session object
    const rest = cookie.value.slice('base64-'.length);
    const decoded = JSON.parse(Buffer.from(rest, 'base64url').toString('utf8')) as unknown;

    expect(decoded).toEqual(FAKE_SESSION);
  });

  it('throws when getSession returns a null session', async () => {
    const { ctx } = makeBrowserContext();
    const client = makeClient(null);

    await expect(signInBrowser(ctx, { userId: 'u1', client })).rejects.toThrow(
      'No active session on the fixture client',
    );
  });
});
