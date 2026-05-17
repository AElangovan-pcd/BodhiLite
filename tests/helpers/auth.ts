import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !serviceRoleKey || !anonKey) {
  throw new Error('Missing Supabase env vars for RLS tests');
}

/** Service-role client used to seed test data and to mint user tokens. */
export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a confirmed auth.user with the given email + password and returns:
 *   - the user id
 *   - a Supabase client authenticated as that user (using anon key + bearer token)
 */
export async function createTestUserClient(opts: {
  email: string;
  password: string;
  role?: 'instructor' | 'student';
}): Promise<{ userId: string; client: SupabaseClient<Database> }> {
  const admin = adminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error('createUser returned no user');

  // Bump role if requested (trigger seeded 'student')
  if (opts.role && opts.role !== 'student') {
    const { error: roleErr } = await admin
      .from('users')
      .update({ role: opts.role })
      .eq('id', created.user.id);
    if (roleErr) throw roleErr;
  }

  const userClient = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email: opts.email,
    password: opts.password,
  });
  if (signInErr) throw signInErr;

  return { userId: created.user.id, client: userClient };
}

/** Tear down by deleting auth.users (CASCADE removes public.users rows). */
export async function deleteTestUser(userId: string): Promise<void> {
  const admin = adminClient();
  await admin.auth.admin.deleteUser(userId);
}
