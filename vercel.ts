import { type VercelConfig } from '@vercel/config/v1';

const config: VercelConfig = {
  buildCommand: 'npm run build',
  framework: 'nextjs',
  regions: ['iad1'], // US-East; co-locates with the Supabase US-East region
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
};

export default config;
