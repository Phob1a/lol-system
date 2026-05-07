import { z } from 'zod';
import { POSITIONS, type PositionLiteral } from '@/lib/players/schema';
import type { PlayerInputType } from '@/lib/players/schema';

// ──────────────────────────────────────────────────────────────────────
// Header normalization (English + Chinese aliases)
// ──────────────────────────────────────────────────────────────────────

export const HEADER_ALIASES: Record<string, string> = {
  gameid: 'gameId',
  game_id: 'gameId',
  '游戏id': 'gameId',
  id: 'gameId',
  nickname: 'nickname',
  name: 'nickname',
  昵称: 'nickname',
  primary: 'primaryPositions',
  primarypositions: 'primaryPositions',
  primary_positions: 'primaryPositions',
  主位: 'primaryPositions',
  主位置: 'primaryPositions',
  secondary: 'secondaryPositions',
  secondarypositions: 'secondaryPositions',
  secondary_positions: 'secondaryPositions',
  副位: 'secondaryPositions',
  副位置: 'secondaryPositions',
  cost: 'cost',
  费用: 'cost',
  iscaptain: 'isCaptain',
  is_captain: 'isCaptain',
  captain: 'isCaptain',
  队长: 'isCaptain',
  是否队长: 'isCaptain',
  isretired: 'isRetired',
  is_retired: 'isRetired',
  retired: 'isRetired',
  退役: 'isRetired',
  是否退役: 'isRetired',
};

export const REQUIRED_COLUMNS = [
  'gameId',
  'nickname',
  'primaryPositions',
  'cost',
] as const;

export function normalizeHeader(raw: string): string {
  const key = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  return HEADER_ALIASES[key] ?? raw.trim();
}

// ──────────────────────────────────────────────────────────────────────
// Position parsing (multi-locale)
// ──────────────────────────────────────────────────────────────────────

const POSITION_ALIAS: Record<string, PositionLiteral> = {
  top: 'TOP',
  上单: 'TOP',
  上: 'TOP',
  jungle: 'JUNGLE',
  jg: 'JUNGLE',
  打野: 'JUNGLE',
  野: 'JUNGLE',
  mid: 'MID',
  中单: 'MID',
  中: 'MID',
  adc: 'ADC',
  bot: 'ADC',
  ad: 'ADC',
  射手: 'ADC',
  下路: 'ADC',
  support: 'SUPPORT',
  sup: 'SUPPORT',
  辅助: 'SUPPORT',
  辅: 'SUPPORT',
};

export function parsePositionList(raw: unknown): PositionLiteral[] {
  if (raw == null) return [];
  const text = String(raw).trim();
  if (!text) return [];
  // Accept comma / Chinese comma / slash / pipe / whitespace as separators.
  const tokens = text.split(/[,，/|;；\s]+/).filter(Boolean);
  const out: PositionLiteral[] = [];
  const seen = new Set<PositionLiteral>();
  for (const t of tokens) {
    const key = t.toLowerCase();
    const upper = t.toUpperCase();
    const candidate: PositionLiteral | undefined =
      POSITION_ALIAS[key] ??
      ((POSITIONS as readonly string[]).includes(upper) ? (upper as PositionLiteral) : undefined);
    if (!candidate) {
      // Use sentinel string to flag unrecognized — caller turns this into an error.
      throw new InvalidPositionError(t);
    }
    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

export class InvalidPositionError extends Error {
  constructor(public readonly token: string) {
    super(`Unknown position: ${token}`);
    this.name = 'InvalidPositionError';
  }
}

// ──────────────────────────────────────────────────────────────────────
// Boolean parsing
// ──────────────────────────────────────────────────────────────────────

const TRUE_TOKENS = new Set(['true', 't', 'yes', 'y', '1', '是', '√', 'on']);
const FALSE_TOKENS = new Set(['false', 'f', 'no', 'n', '0', '否', '×', 'off', '']);

export function parseBoolean(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const text = String(raw ?? '').trim().toLowerCase();
  if (TRUE_TOKENS.has(text)) return true;
  if (FALSE_TOKENS.has(text)) return false;
  throw new InvalidBooleanError(raw);
}

export class InvalidBooleanError extends Error {
  constructor(public readonly raw: unknown) {
    super(`Cannot parse boolean: ${String(raw)}`);
    this.name = 'InvalidBooleanError';
  }
}

// ──────────────────────────────────────────────────────────────────────
// Row validator
// ──────────────────────────────────────────────────────────────────────

export type RawRow = Record<string, unknown>;

export type RowError = { row: number; gameId: string; errors: string[] };

export type RowOk = { row: number; data: PlayerInputType };

export type RowResult = ({ ok: true } & RowOk) | ({ ok: false } & RowError);

const GameIdRe = /^[A-Za-z0-9_\-一-龥#]+$/u;

export function validateRow(rowIndex: number, raw: RawRow, opts: { maxCost: number }): RowResult {
  const errors: string[] = [];
  const get = (k: string) => raw[k];

  const gameIdRaw = String(get('gameId') ?? '').trim();
  if (!gameIdRaw) errors.push('游戏 ID 不能为空');
  else if (gameIdRaw.length > 64) errors.push('游戏 ID 不超过 64 位');
  else if (!GameIdRe.test(gameIdRaw)) errors.push('游戏 ID 仅支持中英文/数字/下划线/连字符');

  const nickname = String(get('nickname') ?? '').trim();
  if (!nickname) errors.push('昵称不能为空');
  else if (nickname.length > 32) errors.push('昵称不超过 32 位');

  let primary: PositionLiteral[] = [];
  try {
    primary = parsePositionList(get('primaryPositions'));
    if (primary.length === 0) errors.push('至少填写一个主位置');
  } catch (e) {
    if (e instanceof InvalidPositionError) errors.push(`主位置无法识别: ${e.token}`);
    else errors.push('主位置解析失败');
  }

  let secondary: PositionLiteral[] = [];
  try {
    secondary = parsePositionList(get('secondaryPositions'));
  } catch (e) {
    if (e instanceof InvalidPositionError) errors.push(`副位置无法识别: ${e.token}`);
    else errors.push('副位置解析失败');
  }

  const costRaw = get('cost');
  let cost = 0;
  if (costRaw === '' || costRaw == null) {
    errors.push('费用不能为空');
  } else {
    const n = Number(costRaw);
    if (!Number.isFinite(n)) errors.push('费用必须是数字');
    else if (n < 0) errors.push('费用不能为负');
    else if (n > opts.maxCost) errors.push(`费用超出上限 (${opts.maxCost})`);
    else cost = n;
  }

  let isCaptain = false;
  try {
    isCaptain = parseBoolean(get('isCaptain'));
  } catch {
    errors.push(`是否队长字段无法识别: ${String(get('isCaptain') ?? '')}`);
  }

  let isRetired = false;
  try {
    isRetired = parseBoolean(get('isRetired'));
  } catch {
    errors.push(`是否退役字段无法识别: ${String(get('isRetired') ?? '')}`);
  }

  if (errors.length > 0) {
    return { ok: false, row: rowIndex, gameId: gameIdRaw, errors };
  }

  return {
    ok: true,
    row: rowIndex,
    data: {
      gameId: gameIdRaw,
      nickname,
      primaryPositions: primary,
      secondaryPositions: secondary,
      cost,
      isCaptain,
      isRetired,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// File-level header check
// ──────────────────────────────────────────────────────────────────────

export type HeaderCheck = { ok: true } | { ok: false; missing: string[] };

export function checkHeaders(headers: string[]): HeaderCheck {
  const normalized = new Set(headers.map((h) => normalizeHeader(h)));
  const missing = REQUIRED_COLUMNS.filter((c) => !normalized.has(c));
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

// ──────────────────────────────────────────────────────────────────────
// Within-file dedup: later occurrence of same gameId wins, with warning.
// ──────────────────────────────────────────────────────────────────────

export type DedupResult = {
  rows: RowOk[];
  duplicates: { gameId: string; rows: number[] }[]; // for warning UX
};

export function dedupByGameId(oks: RowOk[]): DedupResult {
  const seen = new Map<string, RowOk>();
  const dupRows = new Map<string, number[]>();
  for (const r of oks) {
    const key = r.data.gameId;
    if (seen.has(key)) {
      if (!dupRows.has(key)) dupRows.set(key, [seen.get(key)!.row]);
      dupRows.get(key)!.push(r.row);
    }
    seen.set(key, r);
  }
  return {
    rows: Array.from(seen.values()),
    duplicates: Array.from(dupRows.entries()).map(([gameId, rows]) => ({ gameId, rows })),
  };
}

// Re-exported zod for callers
export { z };
