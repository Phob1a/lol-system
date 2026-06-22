/**
 * Data Dragon zh_CN lookups (items / summoner spells / runes), mirroring
 * champions.ts. Built by scripts/build-ddragon.mjs → committed JSON.
 */
import itemData from '@/data/items.json';
import spellData from '@/data/spells.json';
import runeData from '@/data/runes.json';

const ITEMS: Record<string, string> = itemData.items;
const SPELLS: Record<string, string> = spellData.spells;
const RUNES: Record<string, string> = runeData.runes;

/** 装备 id → 中文名 / null。id=0 视为空栏位。 */
export function itemName(id: number | string | null | undefined): string | null {
  if (id == null || id === 0 || id === '0') return null;
  return ITEMS[String(id)] ?? null;
}

/** 召唤师技能数字 id → 中文名 / null。 */
export function summonerSpellName(id: number | string | null | undefined): string | null {
  if (id == null) return null;
  return SPELLS[String(id)] ?? null;
}

/** 符文 / 符文系 id → 中文名 / null。id=0 视为未设置。 */
export function runeName(id: number | string | null | undefined): string | null {
  if (id == null || id === 0 || id === '0') return null;
  return RUNES[String(id)] ?? null;
}
