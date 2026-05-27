import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'components/**/*.test.ts',
      'components/**/*.test.tsx',
      'tests/**/*.test.ts',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**', 'components/**'],
      exclude: ['lib/types/**', '**/*.test.*'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
