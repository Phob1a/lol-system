/**
 * Seed script for E2E test: creates a COMPLETED season with 8 teams,
 * each with 5 players (1 captain + 4 members) so the GameDetailEditor
 * shows stats rows for all 10 players.
 * Usage: node scripts/seed-e2e.mjs
 *
 * The tournament service requires teams belonging to a season.
 * getActiveSeason() returns the first non-ARCHIVED season.
 * We archive the existing non-e2e season and create a fresh COMPLETED
 * season with 8 teams so tournament creation can proceed.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

async function main() {
  // Check existing non-archived seasons
  const existing = await prisma.season.findFirst({ where: { status: { not: 'ARCHIVED' } } });
  console.log('Existing active season:', existing?.name, existing?.status);

  // Check if there's already an e2e season with enough players
  const e2eSeason = await prisma.season.findFirst({ where: { name: 'E2E 测试赛季' } });
  if (e2eSeason) {
    const teams = await prisma.team.count({ where: { seasonId: e2eSeason.id } });
    console.log('E2E season already exists:', e2eSeason.id, 'with', teams, 'teams');
    if (teams >= 8) {
      // Check if teams have 5 slots each
      const slots = await prisma.teamSlot.count({ where: { team: { seasonId: e2eSeason.id } } });
      if (slots >= 40) {
        console.log('E2E season already has enough teams and players. Done.');
        return;
      }
    }
  }

  // Archive the existing non-e2e season if it exists
  if (existing && existing.name !== 'E2E 测试赛季') {
    console.log('Archiving existing season:', existing.name);
    await prisma.season.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  // Create a new COMPLETED season (getActiveSeason returns any non-ARCHIVED season)
  const season = await prisma.season.create({
    data: {
      name: 'E2E 测试赛季',
      status: 'COMPLETED',
      teamBudget: 1000,
    },
  });
  console.log('Created season:', season.id, season.name);

  const teamNames = [
    '天地不仁队', '风云变幻队', '龙腾虎跃队', '星火燎原队',
    '雷霆万钧队', '破釜沉舟队', '势如破竹队', '百战百胜队',
  ];

  for (let i = 0; i < 8; i++) {
    const ts = Date.now() + i * 100;

    // Create 5 players per team (1 captain + 4 members)
    const regs = [];
    for (let j = 0; j < 5; j++) {
      const isCaptain = j === 0;
      const suffix = isCaptain ? `队长${i}` : `队员${i}-${j}`;
      const gameId = `e2e-player-${i}-${j}-${ts}`;
      const player = await prisma.player.create({
        data: { gameId, nickname: `E2E${suffix}` },
      });
      const reg = await prisma.registration.create({
        data: {
          seasonId: season.id,
          playerId: player.id,
          nickname: `E2E${suffix}`,
          primaryPositions: [POSITIONS[j]],
          secondaryPositions: [],
          currentRank: 'GOLD',
          peakRank: 'PLATINUM',
          cost: isCaptain ? 100 : 80,
          status: 'ACTIVE',
          isCaptain,
        },
      });
      regs.push({ reg, position: POSITIONS[j], isCaptain });
    }

    const captainReg = regs[0].reg;
    const username = `e2e-cap-${i}-${ts}`;
    const user = await prisma.user.create({
      data: { username, passwordHash: 'x', role: 'CAPTAIN' },
    });

    const team = await prisma.team.create({
      data: {
        seasonId: season.id,
        name: teamNames[i],
        captainId: captainReg.id,
        userId: user.id,
        budgetLeft: 0,
      },
    });

    // Create 5 slots (one per player per position)
    for (const { reg, position } of regs) {
      await prisma.teamSlot.create({
        data: { teamId: team.id, position, registrationId: reg.id },
      });
    }

    console.log(`Created team: ${team.name} (${team.id}) with ${regs.length} players`);
  }

  const teams = await prisma.team.findMany({ where: { seasonId: season.id } });
  console.log('\nSeed complete!');
  console.log('Season ID:', season.id);
  console.log('Teams:', teams.map(t => t.name).join(', '));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
