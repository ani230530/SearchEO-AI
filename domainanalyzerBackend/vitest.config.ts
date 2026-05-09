import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // No globals — explicit imports keep tests legible.
    globals: false,
    // Don't read .env in tests; LLM calls are stubbed.
    setupFiles: [],
  },
});
