import type { PrismaClient } from '@prisma/client';
import { appendEvent, TournamentStateError } from './tournament-events';

export async function assignTeam(
  db: PrismaClient,
  input: { tournamentId: string; teamId: string; groupLetter: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: { groups: { include: { teams: true } } },
  });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'NOT_STARTED') {
    throw new TournamentStateError('WRONG_STATUS', 'can only assign teams in NOT_STARTED');
  }
  const group = t.groups.find(g => g.letter === input.groupLetter);
  if (!group) throw new TournamentStateError('GROUP_NOT_FOUND', `group ${input.groupLetter} not found`);

  // Already assigned somewhere?
  const existing = await db.groupTeam.findUnique({ where: { teamId: input.teamId } });
  if (existing) {
    throw new TournamentStateError('ALREADY_ASSIGNED', 'team is already in a group');
  }

  if (group.teams.length >= t.teamsPerGroup) {
    throw new TournamentStateError('GROUP_FULL', `group ${input.groupLetter} is full`);
  }

  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'TEAM_ASSIGNED',
    payload: { teamId: input.teamId, groupLetter: input.groupLetter },
    mutate: async (tx) => {
      await tx.groupTeam.create({
        data: { groupId: group.id, teamId: input.teamId, seed: group.teams.length + 1 },
      });
    },
  });
}

export async function startGroupStage(
  db: PrismaClient,
  input: { tournamentId: string; actorId: string },
): Promise<void> {
  const t = await db.tournament.findUnique({
    where: { id: input.tournamentId },
    include: { groups: { include: { teams: true } } },
  });
  if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
  if (t.status !== 'NOT_STARTED') {
    throw new TournamentStateError('WRONG_STATUS', 'can only start in NOT_STARTED');
  }
  for (const g of t.groups) {
    if (g.teams.length !== t.teamsPerGroup) {
      throw new TournamentStateError(
        'GROUP_INCOMPLETE',
        `group ${g.letter} has ${g.teams.length}/${t.teamsPerGroup} teams`,
      );
    }
  }
  if (t.advancingPerGroup * t.groupCount !== 8) {
    throw new TournamentStateError('INVALID_CONFIG', 'advancing × groups must equal 8');
  }

  await appendEvent(db, {
    tournamentId: t.id,
    expectedSeq: t.seq,
    actorId: input.actorId,
    type: 'MATCHES_GENERATED',
    payload: {},
    mutate: async (tx) => {
      for (const g of t.groups) {
        const teamIds = g.teams.map(gt => gt.teamId);
        for (let i = 0; i < teamIds.length; i++) {
          for (let j = i + 1; j < teamIds.length; j++) {
            await tx.match.create({
              data: {
                tournamentId: t.id,
                phase: 'GROUP',
                format: 'BO1',
                status: 'SCHEDULED',
                groupId: g.id,
                teamAId: teamIds[i],
                teamBId: teamIds[j],
              },
            });
          }
        }
      }
      await tx.tournament.update({
        where: { id: t.id },
        data: { status: 'GROUP_STAGE' },
      });
    },
  });
}
