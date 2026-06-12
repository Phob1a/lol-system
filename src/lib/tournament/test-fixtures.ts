import { testDb } from '@/lib/test/db';
import { createTournamentShell } from './tournament-service';
import type { GroupKnockoutConfig } from './types';

/** 在已存在的 season 内造 n 支队（每队 1 队长报名 + user + 1 个占用 MID 的 slot），返回 teamIds。 */
export async function seedTeamsForSeason(seasonId: string, n: number): Promise<string[]> {
  const teamIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const player = await testDb.player.create({
      data: { gameId: `cap-${i}-${Math.random().toString(36).slice(2, 8)}`, nickname: `队长${i}` },
    });
    const reg = await testDb.registration.create({
      data: {
        seasonId, playerId: player.id, nickname: `队长${i}`,
        primaryPositions: ['MID'], secondaryPositions: [],
        currentRank: 'GOLD', peakRank: 'PLATINUM', cost: 100,
        status: 'ACTIVE', isCaptain: true,
      },
    });
    const user = await testDb.user.create({
      data: { username: `cap-${i}-${seasonId.slice(-4)}-${Math.random().toString(36).slice(2, 6)}`, passwordHash: 'x', role: 'CAPTAIN' },
    });
    const team = await testDb.team.create({
      data: { seasonId, name: `队伍${i}`, captainId: reg.id, userId: user.id },
    });
    await testDb.teamSlot.create({ data: { teamId: team.id, position: 'MID', registrationId: reg.id } });
    teamIds.push(team.id);
  }
  return teamIds;
}

/** 造一个 season + n 支队（每队 1 个队长报名 + user），返回 ids */
export async function seedSeasonWithTeams(n: number) {
  const season = await testDb.season.create({
    data: { name: 'S-test', status: 'COMPLETED', teamBudget: 1000 },
  });
  const teamIds = await seedTeamsForSeason(season.id, n);
  return { seasonId: season.id, teamIds };
}

/**
 * 测试夹具：在事务内建赛事骨架（SETUP，无快照），返回 Tournament。
 * 不调用 assignGroups——各测试 setup 自行分组/确认，保持与原流程一致（最小改动）。
 */
export async function createTestTournament(
  db: typeof testDb,
  input: { seasonId: string; teamIds: string[]; config: GroupKnockoutConfig; actorUserId?: string },
) {
  return db.$transaction((tx) =>
    createTournamentShell(tx, {
      seasonId: input.seasonId,
      name: 'x',
      kind: '正赛',
      config: input.config,
      actorUserId: input.actorUserId ?? 'u',
    }),
  );
}

export const CFG_2x4x2 = {
  template: 'group-knockout' as const,
  groupCount: 2,
  teamsPerGroup: 4,
  advancingPerGroup: 2,
  groupBestOf: 1 as const,
  knockoutBestOf: { SF: 3 as const, FINAL: 5 as const },
};

/** 把指定 tournament 内某队的快照补到 5 名 registration（直接造 reg + tournamentTeamPlayer，绕过 slot），返回该队 5 个 registrationId。 */
export async function expandRosterTo5(tournamentId: string, teamId: string): Promise<string[]> {
  const team = (await testDb.team.findUnique({ where: { id: teamId } }))!;
  const tt = (await testDb.tournamentTeam.findFirst({ where: { tournamentId, teamId } }))!;
  const regIds: string[] = (
    await testDb.tournamentTeamPlayer.findMany({ where: { tournamentTeamId: tt.id }, select: { registrationId: true } })
  ).map((x) => x.registrationId);
  let i = regIds.length;
  while (regIds.length < 5) {
    const player = await testDb.player.create({
      data: { gameId: `p-${teamId.slice(-4)}-${i}-${Math.random().toString(36).slice(2, 8)}`, nickname: `选手${i}` },
    });
    const reg = await testDb.registration.create({
      data: {
        seasonId: team.seasonId, playerId: player.id, nickname: `选手${i}`,
        primaryPositions: ['MID'], secondaryPositions: [], currentRank: 'GOLD', peakRank: 'PLATINUM',
        cost: 100, status: 'ACTIVE',
      },
    });
    await testDb.tournamentTeamPlayer.create({ data: { tournamentTeamId: tt.id, registrationId: reg.id } });
    regIds.push(reg.id);
    i++;
  }
  return regIds.slice(0, 5);
}
