import { testDb } from '@/lib/test/db';

/** 造一个 season + n 支队（每队 1 个队长报名 + user），返回 ids */
export async function seedSeasonWithTeams(n: number) {
  const season = await testDb.season.create({
    data: { name: 'S-test', status: 'COMPLETED', teamBudget: 1000 },
  });
  const teamIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const player = await testDb.player.create({
      data: { gameId: `cap-${i}-${Math.random().toString(36).slice(2, 8)}`, nickname: `队长${i}` },
    });
    const reg = await testDb.registration.create({
      data: {
        seasonId: season.id,
        playerId: player.id,
        nickname: `队长${i}`,
        primaryPositions: ['MID'],
        secondaryPositions: [],
        currentRank: 'GOLD',
        peakRank: 'PLATINUM',
        cost: 100,
        status: 'ACTIVE',
        isCaptain: true,
      },
    });
    const user = await testDb.user.create({
      data: { username: `cap-${i}-${season.id.slice(-4)}`, passwordHash: 'x', role: 'CAPTAIN' },
    });
    const team = await testDb.team.create({
      data: { seasonId: season.id, name: `队伍${i}`, captainId: reg.id, userId: user.id },
    });
    await testDb.teamSlot.create({
      data: { teamId: team.id, position: 'MID', registrationId: reg.id },
    });
    teamIds.push(team.id);
  }
  return { seasonId: season.id, teamIds };
}

export const CFG_2x4x2 = {
  template: 'group-knockout' as const,
  groupCount: 2,
  teamsPerGroup: 4,
  advancingPerGroup: 2,
  groupBestOf: 1 as const,
  knockoutBestOf: { SF: 3 as const, FINAL: 5 as const },
};
