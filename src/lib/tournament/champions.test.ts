import { expect, it } from 'vitest';
import { getChampions, isChampionKey, championIconUrl, championName, championKeyByNumericId } from './champions';

it('champions.json 非空且 key 唯一', () => {
  const all = getChampions();
  expect(all.length).toBeGreaterThan(0);
  const keys = all.map((c) => c.key);
  expect(new Set(keys).size).toBe(keys.length);
});

it('每条含 key/name/title', () => {
  for (const c of getChampions()) {
    expect(typeof c.key).toBe('string');
    expect(c.name.length).toBeGreaterThan(0);
    expect(typeof c.title).toBe('string');
  }
});

it('isChampionKey 命中已知 key、拒绝未知', () => {
  const first = getChampions()[0].key;
  expect(isChampionKey(first)).toBe(true);
  expect(isChampionKey('__not_a_champion__')).toBe(false);
});

it('championIconUrl 含 key 与 cdn 域', () => {
  const url = championIconUrl('Ahri');
  expect(url).toContain('Ahri.png');
  expect(url).toContain('ddragon.leagueoflegends.com');
});

it('championName 解析与未命中', () => {
  const c = getChampions()[0];
  expect(championName(c.key)).toBe(c.name);
  expect(championName('__nope__')).toBeNull();
});

it('数字 championId 能映射到 Data Dragon key', () => {
  expect(championKeyByNumericId(266)).toBe('Aatrox');
  expect(championKeyByNumericId(202)).toBe('Jhin');
});

it('未知数字 id 返回 null', () => {
  expect(championKeyByNumericId(99999)).toBeNull();
});
