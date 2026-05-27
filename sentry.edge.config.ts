import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/scrub';

const HMAC_KEY = process.env.SCRUB_HMAC_KEY ?? '';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  beforeSend(event) {
    try {
      return scrubSentryEvent(event, { hmacKey: HMAC_KEY }) as typeof event;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Sentry scrub failed; dropping event', err);
      return null;
    }
  },
});
