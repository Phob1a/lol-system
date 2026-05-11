import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { createTournament } from './tournament-service';
import { assignTeam, startGroupStage } from './groups-service';
import { TournamentStateError } from './tournament-events';

async function setup(teams: number) {
  await db.matchGame.deleteMany();
  await db.match.deleteMany();
  await db.groupTeam.deleteMany();
  await db.group.deleteMany();
  await db.tournamentEvent.deleteMany();
  await db.tournament.deleteMany();
  await db.teamSlot.deleteMany();
  await db.team.deleteMany();
  await db.player.deleteMany();
  await db.user.deleteMany();
  await db.draftSession.deleteMany();
  await db.draftSession.create({ data: { status: 'FINISHED', finishedAt: new Date() } });
  const teamRows = [];
  for (let i = 0; i < teams; i++) {
    const user = await db.user.create({
      data: { gameId: `cap${i}`, passwordHash: 'x', role: 'CAPTAIN' },
    });
    const player = await db.player.create({
      data: {
        gameId: `cap${i}`, nickname: `Captain${i}`, primaryPositions: ['MID'],
        secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id,
      },
    });
    teamRows.push(await db.team.create({
      data: { name: `Team-${i}`, captainId: player.id, budgetLeft: 900 },
    }));
  }
  return teamRows;
}

describe('groups-service', () => {
  it('assigns a team to a group', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    const groupA = await db.group.findFirst({
      where: { tournamentId: t.id, letter: 'A' },
      include: { teams: true },
    });
    expect(groupA?.teams).toHaveLength(1);
    expect(groupA?.teams[0].teamId).toBe(teams[0].id);
  });

  it('rejects assigning the same team twice', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    await expect(
      assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'B', actorId: 'a' }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('rejects assigning more than teamsPerGroup', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[1].id, groupLetter: 'A', actorId: 'a' });
    await expect(
      assignTeam(db, { tournamentId: t.id, teamId: teams[2].id, groupLetter: 'A', actorId: 'a' }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('startGroupStage generates a full round-robin per group', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    // Fill 2 teams per group
    const letters = ['A', 'B', 'C', 'D'] as const;
    for (let i = 0; i < 8; i++) {
      await assignTeam(db, {
        tournamentId: t.id, teamId: teams[i].id,
        groupLetter: letters[Math.floor(i / 2)], actorId: 'a',
      });
    }
    await startGroupStage(db, { tournamentId: t.id, actorId: 'a' });
    const matches = await db.match.findMany({ where: { tournamentId: t.id, phase: 'GROUP' } });
    // 2 teams per group → 1 match per group × 4 groups = 4 matches
    expect(matches).toHaveLength(4);
    const tAfter = await db.tournament.findUnique({ where: { id: t.id } });
    expect(tAfter?.status).toBe('GROUP_STAGE');
  });

  it('startGroupStage rejects if any group is not full', async () => {
    const teams = await setup(8);
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    await expect(
      startGroupStage(db, { tournamentId: t.id, actorId: 'a' }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });
});
