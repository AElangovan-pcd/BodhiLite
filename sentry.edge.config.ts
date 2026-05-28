import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/scrub';

// Edge runtime: node:crypto isn't available, so we omit hashUserId.
// scrubSentryEvent collapses user.id to '[scrubbed]'. Acceptable because
// middleware (the only edge path in this app) does not carry an authenticated
// user.id at the point a Sentry event is captured.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
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
