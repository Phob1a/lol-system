import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const initialPwd = process.env.DEFAULT_ADMIN_PASSWORD ?? 'lol2026';
  const passwordHash = await bcrypt.hash(initialPwd, 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      mustChangePwd: true,
    },
    update: {},
  });

  // Dev convenience: a sample season open for registration.
  if (process.env.SEED_SAMPLE_SEASON === '1') {
    const existing = await prisma.season.findFirst({ where: { status: { not: 'ARCHIVED' } } });
    if (!existing) {
      await prisma.season.create({
        data: { name: 'S1 测试赛季', status: 'REGISTRATION', teamBudget: 1000 },
      });
      console.log('  Sample season "S1 测试赛季" created (REGISTRATION).');
    }
  }

  console.log('Seed complete.');
  console.log(`  Admin account: username="admin" password="${initialPwd}" (must change on first login)`);
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
