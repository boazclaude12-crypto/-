import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
  // Pin the tsconfig esbuild uses. Without this it walks up past the workspace and reads
  // the repository-root tsconfig, which extends a preset this package does not install.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'es2023',
        useDefineForClassFields: false,
        verbatimModuleSyntax: false,
      },
    },
  },
});
