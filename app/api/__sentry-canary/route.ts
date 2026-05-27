import { requireInstructor } from '@/lib/auth/require';

/**
 * Sentry PII-scrub canary. Throws an error with deliberately PII-stuffed payload
 * to verify that the scrub module strips emails / bodies / user.id before upload.
 *
 * Gated by CANARY_FLAG=on. MUST be unset in production (verified in T24).
 * Instructor-only.
 */
export async function POST(_request: Request): Promise<Response> {
  if (process.env.CANARY_FLAG !== 'on') {
    return new Response('Not found', { status: 404 });
  }
  await requireInstructor();

  // Hand-crafted payload designed to exercise every scrub rule:
  // - email in extras (recursive walk)
  // - email in nested-3-deep extras
  // - body-shaped field in extras
  // - user.id present (HMAC hashing)
  // - user.email present (deletion)
  const Sentry = await import('@sentry/nextjs');
  Sentry.setUser({ id: 'canary-user-uuid-xxxx', email: 'canary@example.com' });
  Sentry.captureException(new Error('Sentry canary — verify no PII leaks'), {
    extra: {
      studentEmail: 'student@example.com',
      nested: { deep: { reallyDeep: 'another@example.org' } },
      bodyEcho: 'answer=42&secret=abc',
    },
  });

  return new Response(JSON.stringify({ ok: true, message: 'Canary error captured.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
