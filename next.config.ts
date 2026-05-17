import type { NextConfig } from 'next';

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

export default nextConfig;
