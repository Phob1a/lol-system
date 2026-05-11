import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  createTournament,
  resetTournament,
  getActiveTournament,
  TournamentStateError,
} from './tournament-service';

async function ensureFinishedDraft() {
  // Tests assume a finished draft session exists. Create a minimal one if missing.
  const existing = await db.draftSession.findFirst({ where: { status: 'FINISHED' } });
  if (existing) return;
  await db.draftSession.create({ data: { status: 'FINISHED', finishedAt: new Date() } });
}

describe('tournament-service', () => {
  beforeEach(async () => {
    await db.tournamentEvent.deleteMany();
    await db.tournament.deleteMany();
    await ensureFinishedDraft();
  });

  it('creates a tournament with valid config', async () => {
    const t = await createTournament(db, {
      name: 'Spring 2026', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2,
      actorId: 'admin1',
    });
    expect(t.name).toBe('Spring 2026');
    expect(t.status).toBe('NOT_STARTED');
    expect(t.groups).toHaveLength(4);
    expect(t.groups.map(g => g.letter).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(t.seq).toBe(1);
  });

  it('rejects when advancing × groups != 8', async () => {
    await expect(
      createTournament(db, {
        name: 'Bad', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 3,
        actorId: 'admin1',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('rejects when another tournament is active', async () => {
    await createTournament(db, {
      name: 'A', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2, actorId: 'admin1',
    });
    await expect(
      createTournament(db, {
        name: 'B', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2, actorId: 'admin1',
      }),
    ).rejects.toBeInstanceOf(TournamentStateError);
  });

  it('reset archives the current tournament', async () => {
    const t = await createTournament(db, {
      name: 'Spring', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2, actorId: 'admin1',
    });
    const archived = await resetTournament(db, { tournamentId: t.id, actorId: 'admin1' });
    expect(archived.status).toBe('FINISHED');
    expect(archived.name.startsWith('[archived] ')).toBe(true);
    // active query now returns null
    expect(await getActiveTournament(db)).toBeNull();
  });
});

import { closeGroupStage, createTiebreaker } from './tournament-service';
import { assignTeam, startGroupStage } from './groups-service';
import { recordGame } from './matches-service';

describe('closeGroupStage / createTiebreaker', () => {
  it('closeGroupStage transitions to BRACKET_SEEDING when no ties and all matches FINISHED', async () => {
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
    const teams = [];
    for (let i = 0; i < 8; i++) {
      const user = await db.user.create({ data: { gameId: `c${i}`, passwordHash: 'x', role: 'CAPTAIN' } });
      const p = await db.player.create({
        data: { gameId: `c${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
          secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
      });
      teams.push(await db.team.create({ data: { name: `T-${i}`, captainId: p.id, budgetLeft: 900 } }));
    }
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
    const matches = await db.match.findMany({ where: { tournamentId: t.id, phase: 'GROUP' } });
    for (const m of matches) {
      await recordGame(db, { tournamentId: t.id, matchId: m.id, winnerTeamId: m.teamAId!, actorId: 'a' });
    }
    await closeGroupStage(db, { tournamentId: t.id, actorId: 'a' });
    const after = await db.tournament.findUnique({ where: { id: t.id } });
    expect(after?.status).toBe('BRACKET_SEEDING');
  });

  it('createTiebreaker creates a BO1 TIEBREAKER match between two teams in the same group', async () => {
    // Same setup as above
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
    const teams = [];
    for (let i = 0; i < 8; i++) {
      const user = await db.user.create({ data: { gameId: `c${i}`, passwordHash: 'x', role: 'CAPTAIN' } });
      const p = await db.player.create({
        data: { gameId: `c${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
          secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
      });
      teams.push(await db.team.create({ data: { name: `T-${i}`, captainId: p.id, budgetLeft: 900 } }));
    }
    const t = await createTournament(db, {
      name: 'X', groupCount: 4, teamsPerGroup: 2, advancingPerGroup: 2, actorId: 'a',
    });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[0].id, groupLetter: 'A', actorId: 'a' });
    await assignTeam(db, { tournamentId: t.id, teamId: teams[1].id, groupLetter: 'A', actorId: 'a' });
    await db.tournament.update({ where: { id: t.id }, data: { status: 'GROUP_STAGE' } });
    await createTiebreaker(db, {
      tournamentId: t.id, teamAId: teams[0].id, teamBId: teams[1].id, actorId: 'a',
    });
    const tb = await db.match.findFirst({ where: { tournamentId: t.id, phase: 'TIEBREAKER' } });
    expect(tb).toBeTruthy();
    expect(tb?.format).toBe('BO1');
    expect(tb?.status).toBe('SCHEDULED');
  });
});
