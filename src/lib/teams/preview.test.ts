import { describe, expect, it } from 'vitest';
import { computeTeamPreviews, pickCaptainSlot, type RegistrationRef } from './preview';

function captain(partial: Partial<RegistrationRef> & Pick<RegistrationRef, 'id' | 'gameId'>): RegistrationRef {
  return {
    nickname: partial.nickname ?? partial.gameId,
    primaryPositions: ['MID'],
    cost: 0,
    ...partial,
  } as RegistrationRef;
}

describe('pickCaptainSlot', () => {
  it('picks the first primary in enum order (TOP < JUNGLE < MID < ADC < SUPPORT)', () => {
    expect(pickCaptainSlot({ primaryPositions: ['MID', 'TOP'] })).toBe('TOP');
    expect(pickCaptainSlot({ primaryPositions: ['ADC', 'JUNGLE'] })).toBe('JUNGLE');
    expect(pickCaptainSlot({ primaryPositions: ['SUPPORT'] })).toBe('SUPPORT');
  });

  it('falls back to TOP when no primary positions (defensive)', () => {
    expect(pickCaptainSlot({ primaryPositions: [] })).toBe('TOP');
  });
});

describe('computeTeamPreviews', () => {
  it('debits captain cost from budget and places captain in their slot', () => {
    const c = captain({ id: 'c1', gameId: 'faker', nickname: '李哥', primaryPositions: ['MID'], cost: 300 });
    const [team] = computeTeamPreviews([c], 1000);
    expect(team.budgetLeft).toBe(700);
    expect(team.slots).toHaveLength(5);
    const midSlot = team.slots.find((s) => s.position === 'MID');
    expect(midSlot?.player?.id).toBe('c1');
    const otherSlots = team.slots.filter((s) => s.position !== 'MID');
    expect(otherSlots.every((s) => s.player === null)).toBe(true);
  });

  it('produces one preview per captain', () => {
    const cs = [
      captain({ id: 'c1', gameId: 'A', primaryPositions: ['TOP'], cost: 100 }),
      captain({ id: 'c2', gameId: 'B', primaryPositions: ['JUNGLE'], cost: 150 }),
      captain({ id: 'c3', gameId: 'C', primaryPositions: ['ADC'], cost: 200 }),
    ];
    const teams = computeTeamPreviews(cs, 1000);
    expect(teams).toHaveLength(3);
    expect(teams.map((t) => t.budgetLeft)).toEqual([900, 850, 800]);
  });

  it('slots are always in POSITIONS order', () => {
    const c = captain({ id: 'c1', gameId: 'X', primaryPositions: ['ADC'] });
    const [team] = computeTeamPreviews([c], 1000);
    expect(team.slots.map((s) => s.position)).toEqual(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']);
  });
});
