import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./setupTests.ts'],
    include: ['__tests__/unit/**/*.test.ts', '__tests__/unit/**/*.test.tsx', '__tests__/integration/**/*.test.ts'],
    exclude: ['__tests__/e2e/**', '__tests__/smoke/**', 'node_modules'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'node_modules'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
