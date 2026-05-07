import { describe, expect, it } from 'vitest';
import {
  filterPlayers,
  sortPlayers,
  type PlayerForPool,
} from './filters';

function p(
  partial: Partial<PlayerForPool> & Pick<PlayerForPool, 'id' | 'gameId' | 'nickname'>,
): PlayerForPool {
  return {
    primaryPositions: ['MID'],
    secondaryPositions: [],
    cost: 100,
    ...partial,
  } as PlayerForPool;
}

const players: PlayerForPool[] = [
  p({ id: '1', gameId: 'faker',     nickname: '李哥',   primaryPositions: ['MID'],     secondaryPositions: ['TOP'], cost: 500 }),
  p({ id: '2', gameId: 'showmaker', nickname: '小修',   primaryPositions: ['MID'],     secondaryPositions: [],       cost: 400 }),
  p({ id: '3', gameId: 'canyon',    nickname: '峡谷',   primaryPositions: ['JUNGLE'],  secondaryPositions: ['TOP'], cost: 350 }),
  p({ id: '4', gameId: 'keria',     nickname: '凯瑞亚', primaryPositions: ['SUPPORT'], secondaryPositions: ['MID'], cost: 250 }),
  p({ id: '5', gameId: 'gumayusi',  nickname: '咕妈',   primaryPositions: ['ADC'],     secondaryPositions: [],       cost: 200, isPicked: true }),
];

describe('filterPlayers', () => {
  it('returns all when filter is empty', () => {
    expect(filterPlayers(players, {})).toHaveLength(5);
  });

  it('fuzzy-matches by gameId', () => {
    const r = filterPlayers(players, { search: 'mak' });
    expect(r.map((x) => x.gameId)).toEqual(['showmaker']);
  });

  it('fuzzy-matches by nickname', () => {
    const r = filterPlayers(players, { search: '哥' });
    expect(r.map((x) => x.gameId)).toEqual(['faker']);
  });

  it('search is case-insensitive', () => {
    const r = filterPlayers(players, { search: 'FAKER' });
    expect(r).toHaveLength(1);
  });

  it('primary positions OR within group', () => {
    const r = filterPlayers(players, { primaryPositions: ['MID', 'JUNGLE'] });
    expect(r.map((x) => x.gameId).sort()).toEqual(['canyon', 'faker', 'showmaker']);
  });

  it('secondary positions OR within group', () => {
    const r = filterPlayers(players, { secondaryPositions: ['TOP'] });
    // faker (TOP) and canyon (TOP)
    expect(r.map((x) => x.gameId).sort()).toEqual(['canyon', 'faker']);
  });

  it('AND across primary + secondary groups', () => {
    // primary MID AND secondary TOP -> only faker
    const r = filterPlayers(players, {
      primaryPositions: ['MID'],
      secondaryPositions: ['TOP'],
    });
    expect(r.map((x) => x.gameId)).toEqual(['faker']);
  });

  it('cost range (both bounds)', () => {
    const r = filterPlayers(players, { costMin: 250, costMax: 400 });
    expect(r.map((x) => x.cost).sort((a, b) => a - b)).toEqual([250, 350, 400]);
  });

  it('cost range (only min)', () => {
    const r = filterPlayers(players, { costMin: 400 });
    expect(r).toHaveLength(2);
  });

  it('pickedStatus filters picked-only', () => {
    const r = filterPlayers(players, { pickedStatus: 'picked' });
    expect(r.map((x) => x.gameId)).toEqual(['gumayusi']);
  });

  it('pickedStatus filters unpicked-only', () => {
    const r = filterPlayers(players, { pickedStatus: 'unpicked' });
    expect(r.map((x) => x.gameId)).not.toContain('gumayusi');
    expect(r).toHaveLength(4);
  });

  it('combining filters: search + primary + cost', () => {
    const r = filterPlayers(players, {
      search: 'er',
      primaryPositions: ['MID'],
      costMin: 450,
    });
    expect(r.map((x) => x.gameId)).toEqual(['faker']);
  });

  it('empty primary array does not filter', () => {
    const r = filterPlayers(players, { primaryPositions: [] });
    expect(r).toHaveLength(5);
  });
});

describe('sortPlayers', () => {
  it('sorts by gameId asc by default', () => {
    const r = sortPlayers(players, 'gameId-asc');
    expect(r.map((x) => x.gameId)).toEqual(['canyon', 'faker', 'gumayusi', 'keria', 'showmaker']);
  });

  it('sorts by cost asc', () => {
    const r = sortPlayers(players, 'cost-asc');
    expect(r.map((x) => x.cost)).toEqual([200, 250, 350, 400, 500]);
  });

  it('sorts by cost desc', () => {
    const r = sortPlayers(players, 'cost-desc');
    expect(r.map((x) => x.cost)).toEqual([500, 400, 350, 250, 200]);
  });

  it('sorts by primary position (TOP < JUNGLE < MID < ADC < SUPPORT)', () => {
    const r = sortPlayers(players, 'primary-asc');
    expect(r.map((x) => x.primaryPositions[0])).toEqual([
      'JUNGLE',
      'MID',
      'MID',
      'ADC',
      'SUPPORT',
    ]);
  });

  it('does not mutate the input array', () => {
    const before = players.map((x) => x.gameId);
    sortPlayers(players, 'cost-desc');
    expect(players.map((x) => x.gameId)).toEqual(before);
  });
});
