import { execSync } from 'node:child_process';
import { afterAll, beforeEach } from 'vitest';
import { resetDb, testDb } from './src/lib/test/db';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set to run DB-backed tests');
}

// Apply the current schema to the test database once before the suite.
execSync('npx prisma db push --skip-generate --accept-data-loss', {
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  stdio: 'inherit',
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testDb.$disconnect();
});
