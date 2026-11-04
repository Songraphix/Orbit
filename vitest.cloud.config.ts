import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/** Cloud sync against the Firebase Emulator (npm run test:cloud starts it). */
export default defineConfig({
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
  test: {
    include: ['tests/cloud/**/*.test.ts'],
    environment: 'node',
    // One emulator: test files share it, so they run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
