import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { createTournament } from './tournament-service';
import { assignTeam, startGroupStage } from './groups-service';
import { recordGame } from './matches-service';
import { seedBracket, lockBracket } from './bracket-service';
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
  const out = [];
  for (let i = 0; i < teams; i++) {
    const user = await db.user.create({
      data: { gameId: `cap${i}`, passwordHash: 'x', role: 'CAPTAIN' },
    });
    const player = await db.player.create({
      data: { gameId: `cap${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
        secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
    });
    out.push(await db.team.create({ data: { name: `T-${i}`, captainId: player.id, budgetLeft: 900 } }));
  }
  return out;
}

async function buildBracketSeeding() {
  const teams = await setup(8);
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
  // Finish all group matches; pick a winner for each
  const matches = await db.match.findMany({ where: { tournamentId: t.id, phase: 'GROUP' } });
  for (const m of matches) {
    await recordGame(db, { tournamentId: t.id, matchId: m.id, winnerTeamId: m.teamAId!, actorId: 'a' });
  }
  // Force status to BRACKET_SEEDING (close-group-stage covered in Task 10)
  await db.tournament.update({ where: { id: t.id }, data: { status: 'BRACKET_SEEDING' } });
  return { t, teams };
}

describe('bracket-service', () => {
  it('seedBracket creates 4 QF + 2 SF + 1 FINAL with nextMatchId chain', async () => {
    const { t, teams } = await buildBracketSeeding();
    await seedBracket(db, {
      tournamentId: t.id,
      slots: teams.slice(0, 8).map(x => x.id) as [string, string, string, string, string, string, string, string],
      actorId: 'a',
    });
    const knockout = await db.match.findMany({
      where: { tournamentId: t.id, phase: { in: ['QF', 'SF', 'FINAL'] } },
      orderBy: [{ roundIndex: 'asc' }, { matchIndex: 'asc' }],
    });
    expect(knockout).toHaveLength(7);
    const qfs = knockout.filter(m => m.phase === 'QF');
    const sfs = knockout.filter(m => m.phase === 'SF');
    const finalM = knockout.find(m => m.phase === 'FINAL')!;
    expect(qfs).toHaveLength(4);
    expect(sfs).toHaveLength(2);
    // QF0 and QF1 feed SF0; QF2 and QF3 feed SF1; SFs feed FINAL
    expect(qfs[0].nextMatchId).toBe(sfs[0].id);
    expect(qfs[0].nextSide).toBe('A');
    expect(qfs[1].nextMatchId).toBe(sfs[0].id);
    expect(qfs[1].nextSide).toBe('B');
    expect(qfs[2].nextMatchId).toBe(sfs[1].id);
    expect(qfs[3].nextMatchId).toBe(sfs[1].id);
    expect(sfs[0].nextMatchId).toBe(finalM.id);
    expect(sfs[0].nextSide).toBe('A');
    expect(sfs[1].nextMatchId).toBe(finalM.id);
    expect(sfs[1].nextSide).toBe('B');
    // QF format BO3, FINAL BO5
    expect(qfs[0].format).toBe('BO3');
    expect(sfs[0].format).toBe('BO3');
    expect(finalM.format).toBe('BO5');
  });

  it('lockBracket transitions to KNOCKOUT', async () => {
    const { t, teams } = await buildBracketSeeding();
    await seedBracket(db, {
      tournamentId: t.id,
      slots: teams.slice(0, 8).map(x => x.id) as [string, string, string, string, string, string, string, string],
      actorId: 'a',
    });
    await lockBracket(db, { tournamentId: t.id, actorId: 'a' });
    const after = await db.tournament.findUnique({ where: { id: t.id } });
    expect(after?.status).toBe('KNOCKOUT');
  });

  it('seedBracket rejects duplicate teams', async () => {
    const { t, teams } = await buildBracketSeeding();
    await expect(
      seedBracket(db, {
        tournamentId: t.id,
        slots: [
          teams[0].id, teams[0].id, teams[1].id, teams[2].id,
          teams[3].id, teams[4].id, teams[5].id, teams[6].id,
        ],
        actorId: 'a',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });
});
