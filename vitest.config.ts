import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: true,
    // Tournament integration tests share a single dev Postgres; running test
    // files in parallel causes cross-file pollution (one file's beforeEach
    // deleteMany wipes another file's tournament). Serialize file execution.
    fileParallelism: false,
  },
});
