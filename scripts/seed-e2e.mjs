/**
 * Seed script for E2E test: creates a GROUPING tournament with 8 teams,
 * each with 5 players (1 captain + 4 members) so the GameDetailEditor
 * shows stats rows for all 10 players.
 * Usage: node scripts/seed-e2e.mjs
 *
 * The tournament service requires teams belonging to a tournament.
 * We archive any existing non-e2e tournament and create a fresh GROUPING
 * tournament with 8 teams so grouping/bracket generation can proceed.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const CAPTAIN_PASSWORD = 'lol2026';

const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

const E2E_CONFIG = {
  template: 'group-knockout',
  groupCount: 2,
  teamsPerGroup: 4,
  advancingPerGroup: 2,
  groupBestOf: 1,
  knockoutBestOf: { SF: 3, FINAL: 5 },
};

async function main() {
  // Check existing non-archived tournaments
  const existing = await prisma.tournament.findFirst({ where: { status: { not: 'ARCHIVED' } } });
  console.log('Existing active tournament:', existing?.name, existing?.status);

  // Archive the existing non-e2e tournament if it exists. E2E must be the active tournament.
  if (existing && existing.name !== 'E2E 测试赛事') {
    console.log('Archiving existing tournament:', existing.name);
    await prisma.tournament.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  // Check if there's already an e2e tournament with enough players
  const e2eTournament = await prisma.tournament.findFirst({ where: { name: 'E2E 测试赛事' } });
  if (e2eTournament) {
    await prisma.tournament.update({
      where: { id: e2eTournament.id },
      data: { status: 'GROUPING', archivedAt: null },
    });
    const teams = await prisma.team.count({ where: { tournamentId: e2eTournament.id } });
    console.log('E2E tournament already exists:', e2eTournament.id, 'with', teams, 'teams');
    if (teams >= 8) {
      // Check if teams have 5 slots each
      const slots = await prisma.teamSlot.count({ where: { team: { tournamentId: e2eTournament.id } } });
      if (slots >= 40) {
        const passwordHash = await bcrypt.hash(CAPTAIN_PASSWORD, 10);
        await prisma.user.updateMany({
          where: { team: { tournamentId: e2eTournament.id } },
          data: { passwordHash, mustChangePwd: false },
        });
        console.log('E2E tournament already has enough teams and players. Done.');
        return;
      }
    }
  }

  // Create a new GROUPING tournament (ready for grouping)
  const tournament = await prisma.tournament.create({
    data: {
      name: 'E2E 测试赛事',
      kind: '正赛',
      status: 'GROUPING',
      teamBudget: 1000,
      config: E2E_CONFIG,
    },
  });
  console.log('Created tournament:', tournament.id, tournament.name);

  const teamNames = [
    '天地不仁队', '风云变幻队', '龙腾虎跃队', '星火燎原队',
    '雷霆万钧队', '破釜沉舟队', '势如破竹队', '百战百胜队',
  ];

  const captainPasswordHash = await bcrypt.hash(CAPTAIN_PASSWORD, 10);

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
          tournamentId: tournament.id,
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
      data: {
        username,
        passwordHash: captainPasswordHash,
        role: 'CAPTAIN',
        mustChangePwd: false,
      },
    });

    const team = await prisma.team.create({
      data: {
        tournamentId: tournament.id,
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

  const teams = await prisma.team.findMany({ where: { tournamentId: tournament.id } });
  console.log('\nSeed complete!');
  console.log('Tournament ID:', tournament.id);
  console.log('Teams:', teams.map(t => t.name).join(', '));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
