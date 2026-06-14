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

  // Dev convenience: a sample tournament open for registration.
  if (process.env.SEED_SAMPLE_SEASON === '1') {
    const existing = await prisma.tournament.findFirst({ where: { status: { not: 'ARCHIVED' } } });
    if (!existing) {
      await prisma.tournament.create({
        data: {
          name: 'S1 测试赛事',
          status: 'REGISTRATION',
          teamBudget: 1000,
          kind: '正赛',
          config: { template: 'group-knockout', groupCount: 2, teamsPerGroup: 4, advancingPerGroup: 2, groupBestOf: 1, knockoutBestOf: { SF: 3, FINAL: 5 } },
        },
      });
      console.log('  Sample tournament "S1 测试赛事" created (REGISTRATION).');
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
