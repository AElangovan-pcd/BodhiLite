import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/scrub';

const HMAC_KEY = process.env.NEXT_PUBLIC_SCRUB_HMAC_KEY ?? '';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  beforeSend(event) {
    try {
      return scrubSentryEvent(event, { hmacKey: HMAC_KEY }) as typeof event;
    } catch (err) {
      console.error('Sentry scrub failed; dropping event', err);
      return null;
    }
  },
});
