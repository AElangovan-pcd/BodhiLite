import { createHmac } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/scrub';

const HMAC_KEY = process.env.SCRUB_HMAC_KEY ?? '';

if (!HMAC_KEY && process.env.VERCEL_ENV === 'production') {
  console.error('Sentry: SCRUB_HMAC_KEY is not set in production — user.id hashing is reversible');
}

const hashUserId = (id: string): string =>
  createHmac('sha256', HMAC_KEY).update(id).digest('hex').slice(0, 12);

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  beforeSend(event) {
    try {
      return scrubSentryEvent(event, { hashUserId }) as typeof event;
    } catch (err) {
      console.error('Sentry scrub failed; dropping event', err);
      return null;
    }
  },
});
