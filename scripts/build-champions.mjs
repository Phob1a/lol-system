// 拉取 Riot Data Dragon 最新版本的中文英雄表 → src/data/champions.json
// 用法：node scripts/build-champions.mjs  （需联网；产物提交进仓库）
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/champions.json');

async function main() {
  const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
  const version = versions[0];
  const data = await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/champion.json`)
  ).json();
  const champions = Object.values(data.data)
    .map((c) => ({ key: c.id, name: c.name, title: c.title }))
    .sort((a, b) => a.key.localeCompare(b.key));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ version, champions }, null, 2) + '\n', 'utf8');
  console.log(`wrote ${champions.length} champions @ ${version} → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
