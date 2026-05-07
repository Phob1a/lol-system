import { describe, expect, it } from 'vitest';
import {
  normalizeHeader,
  parsePositionList,
  parseBoolean,
  validateRow,
  checkHeaders,
  dedupByGameId,
  InvalidPositionError,
  InvalidBooleanError,
  type RowOk,
} from './validators';

describe('normalizeHeader', () => {
  it.each([
    ['gameId', 'gameId'],
    ['game_id', 'gameId'],
    ['GameID', 'gameId'],
    ['  gameId  ', 'gameId'],
    ['昵称', 'nickname'],
    ['主位置', 'primaryPositions'],
    ['副位置', 'secondaryPositions'],
    ['费用', 'cost'],
    ['是否队长', 'isCaptain'],
    ['是否退役', 'isRetired'],
    ['unknown', 'unknown'],
  ])('normalizes %s -> %s', (raw, expected) => {
    expect(normalizeHeader(raw)).toBe(expected);
  });
});

describe('parsePositionList', () => {
  it('parses English positions', () => {
    expect(parsePositionList('TOP,MID,ADC')).toEqual(['TOP', 'MID', 'ADC']);
  });
  it('parses Chinese positions', () => {
    expect(parsePositionList('上单,打野,辅助')).toEqual(['TOP', 'JUNGLE', 'SUPPORT']);
  });
  it('parses mixed separators (comma, slash, fullwidth comma, pipe)', () => {
    expect(parsePositionList('TOP / 中单 ， ADC | SUP')).toEqual(['TOP', 'MID', 'ADC', 'SUPPORT']);
  });
  it('dedups duplicates', () => {
    expect(parsePositionList('TOP,TOP,MID')).toEqual(['TOP', 'MID']);
  });
  it('returns empty for empty input', () => {
    expect(parsePositionList('')).toEqual([]);
    expect(parsePositionList(null)).toEqual([]);
    expect(parsePositionList(undefined)).toEqual([]);
  });
  it('throws on unknown token', () => {
    expect(() => parsePositionList('TOP,FOO')).toThrow(InvalidPositionError);
  });
  it('handles aliases', () => {
    expect(parsePositionList('jg,sup,bot')).toEqual(['JUNGLE', 'SUPPORT', 'ADC']);
  });
});

describe('parseBoolean', () => {
  it.each([
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    ['true', true],
    ['false', false],
    ['Yes', true],
    ['no', false],
    ['是', true],
    ['否', false],
    ['1', true],
    ['0', false],
    ['', false],
  ])('parses %s -> %s', (raw, expected) => {
    expect(parseBoolean(raw)).toBe(expected);
  });

  it('throws on garbage', () => {
    expect(() => parseBoolean('maybe')).toThrow(InvalidBooleanError);
  });
});

describe('checkHeaders', () => {
  it('passes when all required columns present (any order, any locale)', () => {
    expect(checkHeaders(['gameId', 'nickname', '主位置', 'cost'])).toEqual({ ok: true });
  });
  it('reports missing columns', () => {
    const r = checkHeaders(['gameId', 'nickname']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain('primaryPositions');
  });
});

describe('validateRow', () => {
  const opts = { maxCost: 2000 };

  it('happy path', () => {
    const r = validateRow(2, {
      gameId: 'faker',
      nickname: '李哥',
      primaryPositions: 'MID',
      secondaryPositions: 'TOP',
      cost: '300',
      isCaptain: 'true',
      isRetired: 'false',
    }, opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({
        gameId: 'faker',
        nickname: '李哥',
        primaryPositions: ['MID'],
        secondaryPositions: ['TOP'],
        cost: 300,
        isCaptain: true,
        isRetired: false,
      });
    }
  });

  it('rejects empty gameId', () => {
    const r = validateRow(2, { gameId: '', nickname: 'a', primaryPositions: 'MID', cost: 0 }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes('游戏 ID'))).toBe(true);
  });

  it('rejects bad gameId chars', () => {
    const r = validateRow(2, { gameId: 'bad id!', nickname: 'a', primaryPositions: 'MID', cost: 0 }, opts);
    expect(r.ok).toBe(false);
  });

  it('accepts Chinese gameId', () => {
    const r = validateRow(2, { gameId: '李哥', nickname: 'L', primaryPositions: 'MID', cost: 0 }, opts);
    expect(r.ok).toBe(true);
  });

  it('accepts gameId with hash tag (Chinese + #digits)', () => {
    const r = validateRow(2, { gameId: '夜阑惊梦#23923', nickname: '夜', primaryPositions: 'MID', cost: 0 }, opts);
    expect(r.ok).toBe(true);
  });

  it('accepts gameId with hash tag (English + #digits)', () => {
    const r = validateRow(2, { gameId: 'Faker#KR1', nickname: 'F', primaryPositions: 'MID', cost: 0 }, opts);
    expect(r.ok).toBe(true);
  });

  it('still rejects gameId with disallowed chars even with hash', () => {
    const r = validateRow(2, { gameId: 'name!#1', nickname: 'X', primaryPositions: 'MID', cost: 0 }, opts);
    expect(r.ok).toBe(false);
  });

  it('rejects empty nickname', () => {
    const r = validateRow(2, { gameId: 'a', nickname: '', primaryPositions: 'MID', cost: 0 }, opts);
    expect(r.ok).toBe(false);
  });

  it('rejects empty primary positions', () => {
    const r = validateRow(2, { gameId: 'a', nickname: 'b', primaryPositions: '', cost: 0 }, opts);
    expect(r.ok).toBe(false);
  });

  it('rejects unknown position', () => {
    const r = validateRow(2, { gameId: 'a', nickname: 'b', primaryPositions: 'TOP,XXX', cost: 0 }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes('XXX'))).toBe(true);
  });

  it('rejects negative cost', () => {
    const r = validateRow(2, { gameId: 'a', nickname: 'b', primaryPositions: 'MID', cost: -5 }, opts);
    expect(r.ok).toBe(false);
  });

  it('accepts decimal cost', () => {
    const r = validateRow(2, { gameId: 'a', nickname: 'b', primaryPositions: 'MID', cost: 1.5 }, opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.cost).toBe(1.5);
  });

  it('rejects non-numeric cost', () => {
    const r = validateRow(2, { gameId: 'a', nickname: 'b', primaryPositions: 'MID', cost: 'abc' }, opts);
    expect(r.ok).toBe(false);
  });

  it('rejects cost over max', () => {
    const r = validateRow(2, { gameId: 'a', nickname: 'b', primaryPositions: 'MID', cost: 3000 }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes('上限'))).toBe(true);
  });

  it('treats missing optional fields as defaults', () => {
    const r = validateRow(2, {
      gameId: 'a',
      nickname: 'b',
      primaryPositions: 'MID',
      cost: 100,
      // secondaryPositions, isCaptain, isRetired all missing
    }, opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.secondaryPositions).toEqual([]);
      expect(r.data.isCaptain).toBe(false);
      expect(r.data.isRetired).toBe(false);
    }
  });

  it('reports multiple errors at once', () => {
    const r = validateRow(2, {
      gameId: '',
      nickname: '',
      primaryPositions: 'XXX',
      cost: -1,
      isCaptain: 'maybe',
    }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('dedupByGameId', () => {
  function row(rowNo: number, gameId: string, nickname: string): RowOk {
    return {
      ok: true,
      row: rowNo,
      data: {
        gameId,
        nickname,
        primaryPositions: ['MID'],
        secondaryPositions: [],
        cost: 0,
        isCaptain: false,
        isRetired: false,
      },
    } as unknown as RowOk;
  }

  it('keeps last occurrence and reports duplicates', () => {
    const r = dedupByGameId([
      row(2, 'faker', 'A'),
      row(3, 'showmaker', 'B'),
      row(4, 'faker', 'C'),
      row(5, 'faker', 'D'),
    ]);
    // Map iteration order: faker was inserted first (row 2) so it stays first
    // (its value updated to D); showmaker (row 3) stays second.
    expect(r.rows.map((x) => x.data.nickname)).toEqual(['D', 'B']);
    expect(r.duplicates).toEqual([{ gameId: 'faker', rows: [2, 4, 5] }]);
  });

  it('reports nothing if no duplicates', () => {
    const r = dedupByGameId([row(2, 'a', 'A'), row(3, 'b', 'B')]);
    expect(r.duplicates).toEqual([]);
  });
});
