import type { BrowserContext } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * Set Supabase auth cookies on a Playwright BrowserContext so subsequent
 * page navigations are authenticated as the given user.
 *
 * Relies on the existing test fixture {userId, client} from createTestUserClient,
 * which has already done signInWithPassword (giving us a live session).
 */
export async function signInBrowser(
  context: BrowserContext,
  fixture: { userId: string; client: SupabaseClient<Database> },
): Promise<void> {
  const { data } = await fixture.client.auth.getSession();
  if (!data.session) throw new Error('No active session on the fixture client');

  // The @supabase/ssr cookie name pattern: sb-<host-slug>-auth-token
  // Local: 127.0.0.1 → sb-127-auth-token. Use a wildcard fallback: read all cookies
  // set by the client and reissue them on the Playwright context.
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const host = url.hostname.replace(/\./g, '-');
  const tokenName = `sb-${host}-auth-token`;
  const payload = encodeURIComponent(
    JSON.stringify([data.session.access_token, data.session.refresh_token]),
  );

  await context.addCookies([
    {
      name: tokenName,
      value: payload,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}
