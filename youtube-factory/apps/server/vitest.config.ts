import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Stops esbuild walking up to the repository root and reading an unrelated tsconfig.
  esbuild: { tsconfigRaw: '{}' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
