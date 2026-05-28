import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/scrub';

// Browser runtime: we deliberately do NOT inject hashUserId here. Doing so
// would require shipping the HMAC key in the JS bundle (NEXT_PUBLIC_*),
// which would let any client de-anonymize the hash and defeat the purpose.
// scrubSentryEvent collapses user.id to '[scrubbed]' when no hash is supplied.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  beforeSend(event) {
    try {
      return scrubSentryEvent(event) as typeof event;
    } catch (err) {
      console.error('Sentry scrub failed; dropping event', err);
      return null;
    }
  },
});
