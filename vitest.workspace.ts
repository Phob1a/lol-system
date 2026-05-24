import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      environment: 'node',
      include: ['src/lib/**/*.test.ts'],
      globals: true,
      setupFiles: ['./vitest.setup.db.ts'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'component',
      environment: 'jsdom',
      include: ['src/components/**/*.test.tsx'],
      globals: true,
      setupFiles: ['./vitest.setup.dom.ts'],
    },
  },
]);
