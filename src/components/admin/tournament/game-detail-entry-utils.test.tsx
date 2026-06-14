import { describe, expect, it } from 'vitest';
import {
  buildBansPayload,
  buildStandardBanRows,
  derivePicksFromStats,
  findChampionDuplicate,
  isStatsAllComplete,
  isStatsPristine,
  parseKda,
  type BanRowDraft,
  type ChampionDuplicateInput,
  type PickDraft,
  type StatRowDraft,
} from './game-detail-entry-utils';

const teamA = 'team-a';
const teamB = 'team-b';

function stat(registrationId: string, championId: string | null, patch: Partial<StatRowDraft> = {}): StatRowDraft {
  return {
    registrationId,
    nickname: registrationId,
    championId,
    kda: '1/2/3',
    cs: '100',
    damage: '10000',
    gold: '9000',
    ...patch,
  };
}

describe('game detail entry utils', () => {
  it('parseKda accepts slash, space, and dash separators', () => {
    expect(parseKda('12/3/7')).toEqual({ kills: 12, deaths: 3, assists: 7 });
    expect(parseKda('12 3 7')).toEqual({ kills: 12, deaths: 3, assists: 7 });
    expect(parseKda('12-3-7')).toEqual({ kills: 12, deaths: 3, assists: 7 });
    expect(parseKda('12/3')).toBeNull();
    expect(parseKda('a/b/c')).toBeNull();
    expect(parseKda('')).toBeNull();
  });

  it('detects pristine, partial, and complete stats', () => {
    const empty = [stat('a1', null, { kda: '', cs: '', damage: '', gold: '' })];
    const partial = [stat('a1', 'Ahri', { kda: '', cs: '', damage: '', gold: '' })];
    const completeA = Array.from({ length: 5 }, (_, i) => stat(`a${i}`, `A${i}`));
    const completeB = Array.from({ length: 5 }, (_, i) => stat(`b${i}`, `B${i}`));

    expect(isStatsPristine(empty)).toBe(true);
    expect(isStatsPristine(partial)).toBe(false);
    expect(isStatsAllComplete(completeA, completeB)).toBe(true);
    expect(isStatsAllComplete(completeA, completeB.slice(0, 4))).toBe(false);
  });

  it('derives 10 PICK rows from complete stats with team ownership', () => {
    const statsA = Array.from({ length: 5 }, (_, i) => stat(`a${i}`, `A${i}`));
    const statsB = Array.from({ length: 5 }, (_, i) => stat(`b${i}`, `B${i}`));

    expect(derivePicksFromStats(statsA, statsB, teamA, teamB)).toEqual([
      { teamId: teamA, type: 'PICK', championId: 'A0' },
      { teamId: teamA, type: 'PICK', championId: 'A1' },
      { teamId: teamA, type: 'PICK', championId: 'A2' },
      { teamId: teamA, type: 'PICK', championId: 'A3' },
      { teamId: teamA, type: 'PICK', championId: 'A4' },
      { teamId: teamB, type: 'PICK', championId: 'B0' },
      { teamId: teamB, type: 'PICK', championId: 'B1' },
      { teamId: teamB, type: 'PICK', championId: 'B2' },
      { teamId: teamB, type: 'PICK', championId: 'B3' },
      { teamId: teamB, type: 'PICK', championId: 'B4' },
    ]);
  });

  it('builds final bans payload with derived picks when stats are complete', () => {
    const banRows: BanRowDraft[] = [
      { teamId: teamA, championId: 'BanA' },
      { teamId: teamB, championId: 'BanB' },
    ];
    const derivedPicks = [
      { teamId: teamA, type: 'PICK' as const, championId: 'Ahri' },
      { teamId: teamB, type: 'PICK' as const, championId: 'Garen' },
    ];
    const legacyPicks = [{ teamId: teamA, type: 'PICK' as const, championId: 'Legacy' }];

    expect(buildBansPayload({ banRows, derivedPicks, legacyPicks, useDerivedPicks: true })).toEqual([
      { teamId: teamA, type: 'BAN', championId: 'BanA', order: 1 },
      { teamId: teamB, type: 'BAN', championId: 'BanB', order: 2 },
      { teamId: teamA, type: 'PICK', championId: 'Ahri', order: 3 },
      { teamId: teamB, type: 'PICK', championId: 'Garen', order: 4 },
    ]);
  });

  it('preserves legacy picks when stats are not complete', () => {
    const banRows: BanRowDraft[] = [{ teamId: teamA, championId: 'BanA' }];
    const legacyPicks = [
      { teamId: teamB, type: 'PICK' as const, championId: 'Legacy1' },
      { teamId: teamA, type: 'PICK' as const, championId: 'Legacy2' },
    ];

    expect(buildBansPayload({ banRows, derivedPicks: [], legacyPicks, useDerivedPicks: false })).toEqual([
      { teamId: teamA, type: 'BAN', championId: 'BanA', order: 1 },
      { teamId: teamB, type: 'PICK', championId: 'Legacy1', order: 2 },
      { teamId: teamA, type: 'PICK', championId: 'Legacy2', order: 3 },
    ]);
  });

  it('detects duplicate champions across ban and pick segments', () => {
    expect(findChampionDuplicate([
      { source: 'ban', label: 'BAN 1', championId: 'Ahri' },
      { source: 'pick', label: 'PICK 1', championId: 'Ahri' },
    ])).toEqual({ championId: 'Ahri', firstLabel: 'BAN 1', secondLabel: 'PICK 1' });
  });

  it('exposes approved pick and duplicate input contracts', () => {
    const pick: PickDraft = { teamId: teamA, type: 'PICK', championId: 'Ahri' };
    const statDuplicate: ChampionDuplicateInput = { source: 'stat', label: 'STAT 1', championId: 'Ahri' };

    expect(pick).toEqual({ teamId: teamA, type: 'PICK', championId: 'Ahri' });
    expect(findChampionDuplicate([
      { source: 'ban', label: 'BAN 1', championId: 'Ahri' },
      statDuplicate,
    ])).toEqual({ championId: 'Ahri', firstLabel: 'BAN 1', secondLabel: 'STAT 1' });
  });

  it('builds a blue-red alternating standard ban template', () => {
    expect(buildStandardBanRows('blue', 'red')).toEqual([
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
      { teamId: 'blue', championId: null },
      { teamId: 'red', championId: null },
    ]);
  });
});
