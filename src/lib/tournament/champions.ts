import data from '@/data/champions.json';

export type Champion = { key: string; riotId: number; name: string; title: string };

const CHAMPIONS: Champion[] = data.champions;
const KEY_SET = new Set(CHAMPIONS.map((c) => c.key));
const BY_NUMERIC = new Map<number, string>(CHAMPIONS.map((c) => [c.riotId, c.key]));
const VERSION: string = data.version;

/** 全部英雄（已按 key 排序，来自构建产物 JSON）。 */
export function getChampions(): Champion[] {
  return CHAMPIONS;
}

/** Data Dragon 头像 URL；加载失败 UI 退化为英雄名文字（不做本地图片包）。 */
export function championIconUrl(key: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${VERSION}/img/champion/${key}.png`;
}

/** key 是否为合法英雄（saveGameDetail 后端强校验 BP/stats championId ∈ 此集合）。 */
export function isChampionKey(key: string): boolean {
  return KEY_SET.has(key);
}

/** 英雄名 / null（找不到）——读模型解析 championId → 中文名用。 */
export function championName(key: string): string | null {
  return CHAMPIONS.find((c) => c.key === key)?.name ?? null;
}

/** Riot 数字 championId → Data Dragon string key / null（未知 id）。 */
export function championKeyByNumericId(id: number): string | null {
  return BY_NUMERIC.get(id) ?? null;
}
