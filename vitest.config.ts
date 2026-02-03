import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '**/*.test.ts', 'src/__tests__/setup.ts', 'src/embeddings/index.ts', 'src/search/index.ts'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
