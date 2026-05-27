import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Prevents Turbopack workspace-root detection warning from the parent
  // ClaudeProjects/package.json. Safe to remove if BodhiLite is ever
  // extracted to its own standalone repository.
  turbopack: {
    root: __dirname,
  },
  reactStrictMode: true,
  typedRoutes: true,
  poweredByHeader: false, // FERPA: do not expose internal info in headers
};

export default withSentryConfig(nextConfig, {
  // Auto-injected by the Vercel Marketplace Sentry integration:
  ...(process.env.SENTRY_ORG && { org: process.env.SENTRY_ORG }),
  ...(process.env.SENTRY_PROJECT && { project: process.env.SENTRY_PROJECT }),
  ...(process.env.SENTRY_AUTH_TOKEN && { authToken: process.env.SENTRY_AUTH_TOKEN }),

  // Quiet output on local non-CI builds; full output on CI for source-map upload visibility.
  silent: !process.env.CI,

  // Hide source-map upload spam from non-CI local builds.
  disableLogger: true,
});
