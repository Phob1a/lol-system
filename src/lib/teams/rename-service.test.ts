import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { renameTeam, TeamRenameError } from './rename-service';

async function setup(names: string[]) {
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
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const user = await db.user.create({ data: { gameId: `c${i}`, passwordHash: 'x', role: 'CAPTAIN' } });
    const p = await db.player.create({
      data: { gameId: `c${i}`, nickname: `C${i}`, primaryPositions: ['MID'],
        secondaryPositions: [], cost: 100, isCaptain: true, userId: user.id },
    });
    out.push(await db.team.create({ data: { name: names[i], captainId: p.id, budgetLeft: 900 } }));
  }
  return out;
}

describe('renameTeam', () => {
  it('renames a team to a valid new name', async () => {
    const [t] = await setup(['Original']);
    await renameTeam(db, { teamId: t.id, newName: '  New Name  ' });
    const after = await db.team.findUnique({ where: { id: t.id } });
    expect(after?.name).toBe('New Name');
  });

  it('rejects too-short / too-long names', async () => {
    const [t] = await setup(['Original']);
    await expect(renameTeam(db, { teamId: t.id, newName: 'A' }))
      .rejects.toBeInstanceOf(TeamRenameError);
    await expect(renameTeam(db, { teamId: t.id, newName: 'X'.repeat(31) }))
      .rejects.toBeInstanceOf(TeamRenameError);
  });

  it('rejects duplicate names (case-sensitive)', async () => {
    const [a, b] = await setup(['Alpha', 'Beta']);
    await expect(renameTeam(db, { teamId: b.id, newName: 'Alpha' }))
      .rejects.toBeInstanceOf(TeamRenameError);
  });
});
