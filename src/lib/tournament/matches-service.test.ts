import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { createTournament } from './tournament-service';
import { assignTeam, startGroupStage } from './groups-service';
import {
  scheduleMatch,
  recordGame,
  revokeLastGame,
  declareWalkover,
} from './matches-service';
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
      data: { gameId: `cap${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
        secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
    });
    teamRows.push(await db.team.create({
      data: { name: `T-${i}`, captainId: player.id, budgetLeft: 900 },
    }));
  }
  return teamRows;
}

async function startedTournament(teams: ReturnType<typeof setup> extends Promise<infer R> ? R : never) {
  const t = await createTournament(db, {
    name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
  });
  const letters = ['A', 'B', 'C', 'D'] as const;
  for (let i = 0; i < 8; i++) {
    await assignTeam(db, {
      tournamentId: t.id, teamId: teams[i].id,
      groupLetter: letters[Math.floor(i / 2)], actorId: 'a',
    });
  }
  await startGroupStage(db, { tournamentId: t.id, actorId: 'a' });
  return t.id;
}

describe('matches-service', () => {
  it('scheduleMatch sets scheduledAt', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    const when = new Date('2026-06-01T19:00:00Z');
    await scheduleMatch(db, { tournamentId: tId, matchId: m.id, scheduledAt: when, actorId: 'a' });
    const after = await db.match.findUnique({ where: { id: m.id } });
    expect(after?.scheduledAt?.toISOString()).toBe(when.toISOString());
  });

  it('recordGame on BO1 finishes the match', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    await recordGame(db, {
      tournamentId: tId, matchId: m.id, winnerTeamId: m.teamAId!, actorId: 'a',
    });
    const after = await db.match.findUnique({
      where: { id: m.id }, include: { games: true },
    });
    expect(after?.status).toBe('FINISHED');
    expect(after?.winnerTeamId).toBe(m.teamAId);
    expect(after?.games).toHaveLength(1);
  });

  it('recordGame rejects winner not in match', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    const otherTeam = teams.find(t => t.id !== m.teamAId && t.id !== m.teamBId)!;
    await expect(
      recordGame(db, {
        tournamentId: tId, matchId: m.id, winnerTeamId: otherTeam.id, actorId: 'a',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('revokeLastGame rewinds a finished BO1', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    await recordGame(db, { tournamentId: tId, matchId: m.id, winnerTeamId: m.teamAId!, actorId: 'a' });
    await revokeLastGame(db, { tournamentId: tId, matchId: m.id, actorId: 'a' });
    const after = await db.match.findUnique({
      where: { id: m.id }, include: { games: true },
    });
    expect(after?.status).toBe('SCHEDULED');
    expect(after?.winnerTeamId).toBeNull();
    expect(after?.games).toHaveLength(0);
  });

  it('declareWalkover sets status WALKOVER + winner', async () => {
    const teams = await setup(8);
    const tId = await startedTournament(teams);
    const m = (await db.match.findFirst({ where: { tournamentId: tId } }))!;
    await declareWalkover(db, {
      tournamentId: tId, matchId: m.id, winnerTeamId: m.teamAId!, note: 'opp no-show', actorId: 'a',
    });
    const after = await db.match.findUnique({ where: { id: m.id } });
    expect(after?.status).toBe('WALKOVER');
    expect(after?.winnerTeamId).toBe(m.teamAId);
    expect(after?.walkoverNote).toBe('opp no-show');
  });
});
