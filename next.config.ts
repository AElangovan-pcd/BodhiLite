import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevents Turbopack workspace-root detection warning from the parent
  // ClaudeProjects/package.json. Safe to remove if BodhiLite is ever
  // extracted to its own standalone repository.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
