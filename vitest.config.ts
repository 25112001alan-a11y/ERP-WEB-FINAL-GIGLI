import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Front unit tests only. The server has its own node:test suite (npm run test:server).
    include: ['src/**/*.test.ts'],
  },
});