// 拉取 Riot Data Dragon 最新 zh_CN 的装备 / 召唤师技能 / 符文表
// → src/data/items.json, src/data/spells.json, src/data/runes.json
// 用法：node scripts/build-ddragon.mjs  （需联网；产物提交进仓库）
// 与 build-champions.mjs 同源同口径。
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, '../src/data');

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  return r.json();
}

async function main() {
  const versions = await getJson('https://ddragon.leagueoflegends.com/api/versions.json');
  const version = versions[0];
  const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN`;
  await mkdir(DATA, { recursive: true });

  // ── items: { [id]: 中文名 } ──────────────────────────────────────────────
  const itemRaw = await getJson(`${base}/item.json`);
  const items = {};
  for (const [id, it] of Object.entries(itemRaw.data)) {
    if (it?.name) items[id] = it.name;
  }
  await writeFile(resolve(DATA, 'items.json'), JSON.stringify({ version, items }, null, 2) + '\n', 'utf8');
  console.log(`wrote ${Object.keys(items).length} items @ ${version}`);

  // ── summoner spells: { [numericKey]: 中文名 } ────────────────────────────
  const spellRaw = await getJson(`${base}/summoner.json`);
  const spells = {};
  for (const s of Object.values(spellRaw.data)) {
    if (s?.key && s?.name) spells[s.key] = s.name; // key is the numeric id as string
  }
  await writeFile(resolve(DATA, 'spells.json'), JSON.stringify({ version, spells }, null, 2) + '\n', 'utf8');
  console.log(`wrote ${Object.keys(spells).length} summoner spells @ ${version}`);

  // ── runes (perks): { [id]: 中文名 } — styles + individual runes ──────────
  const runeRaw = await getJson(`${base}/runesReforged.json`);
  const runes = {};
  for (const style of runeRaw) {
    if (style?.id && style?.name) runes[style.id] = style.name; // 8000 精密 etc.
    for (const slot of style.slots ?? []) {
      for (const rune of slot.runes ?? []) {
        if (rune?.id && rune?.name) runes[rune.id] = rune.name;
      }
    }
  }
  await writeFile(resolve(DATA, 'runes.json'), JSON.stringify({ version, runes }, null, 2) + '\n', 'utf8');
  console.log(`wrote ${Object.keys(runes).length} runes @ ${version}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
