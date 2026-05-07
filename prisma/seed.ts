import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. Singleton Config row
  await prisma.config.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      teamBudget: 1000,
      draftLocked: false,
      extras: {},
    },
    update: {},
  });

  // 2. Default admin account.
  // Username `admin`. Initial password from env DEFAULT_USER_PASSWORD (fallback: "lol2026").
  // mustChangePwd=true forces password change on first login.
  const initialPwd = process.env.DEFAULT_USER_PASSWORD ?? 'lol2026';
  const passwordHash = await bcrypt.hash(initialPwd, 10);

  await prisma.user.upsert({
    where: { gameId: 'admin' },
    create: {
      gameId: 'admin',
      passwordHash,
      role: 'ADMIN',
      mustChangePwd: true,
    },
    update: {},
  });

  console.log('Seed complete.');
  console.log(`  Admin account: gameId="admin" password="${initialPwd}" (must change on first login)`);
  console.log('  Default team budget: 1000');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
