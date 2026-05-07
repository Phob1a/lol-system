// Convert /Users/bytedance/Downloads/roster_without_captains_utf8_bom.csv
// into the format accepted by /admin/players/import.
//
// Transformations:
//   1. Split 名称 into gameId + nickname (gameId = full name with '#' tag normalized;
//      nickname = portion before '#', or full name if no '#').
//   2. Normalize gameId: '＃' → '#', strip inner whitespace, trim ends.
//   3. Keep 费用 as the original decimal (e.g. 3.5 / 4.75) — the schema now
//      stores cost as Float, so no scaling needed.
//   4. All isCaptain = false, isRetired = false (source is "without captains").
//
// Output: /Users/bytedance/Downloads/roster_for_import.csv (UTF-8 + BOM).

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = '/Users/bytedance/Downloads/roster_without_captains_utf8_bom.csv';
const DST = '/Users/bytedance/Downloads/roster_for_import.csv';

const raw = readFileSync(SRC, 'utf8').replace(/^﻿/, ''); // strip BOM
const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
const [header, ...dataLines] = lines;
console.log(`[convert] header=${JSON.stringify(header)}`);
console.log(`[convert] data rows: ${dataLines.length}`);

function csvSplit(line) {
  // Simple comma split — source has no quoted fields.
  return line.split(',').map((c) => c.trim());
}

function normalizeGameId(raw) {
  return raw
    .replace(/＃/g, '#')           // full-width → half-width
    .replace(/\s+/g, '')           // strip ALL whitespace
    .trim();
}

function deriveNickname(normalizedGameId) {
  const hashIdx = normalizedGameId.indexOf('#');
  return hashIdx === -1 ? normalizedGameId : normalizedGameId.slice(0, hashIdx);
}

function convertCost(raw) {
  const f = parseFloat(raw);
  if (!isFinite(f)) return null;
  return f;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const outHeaders = ['gameId', 'nickname', 'primaryPositions', 'secondaryPositions', 'cost', 'isCaptain', 'isRetired'];
const outRows = [outHeaders.map(csvEscape).join(',')];

const skipped = [];
for (let i = 0; i < dataLines.length; i++) {
  const cells = csvSplit(dataLines[i]);
  if (cells.length < 4) { skipped.push({ row: i + 2, line: dataLines[i], reason: 'too few columns' }); continue; }
  const [name, primary, secondary, cost] = cells;

  const gameId = normalizeGameId(name);
  if (!gameId) { skipped.push({ row: i + 2, line: dataLines[i], reason: 'empty gameId after normalize' }); continue; }

  const nickname = deriveNickname(gameId);
  const costInt = convertCost(cost);
  if (costInt == null) { skipped.push({ row: i + 2, line: dataLines[i], reason: `bad cost ${cost}` }); continue; }

  outRows.push([
    csvEscape(gameId),
    csvEscape(nickname),
    csvEscape(primary || ''),
    csvEscape(secondary || ''),
    String(costInt),  // (variable name retained; value is now decimal)
    'false',
    'false',
  ].join(','));
}

const csvOut = '﻿' + outRows.join('\r\n') + '\r\n';
writeFileSync(DST, csvOut, 'utf8');

console.log(`[convert] wrote ${outRows.length - 1} rows to ${DST}`);
if (skipped.length > 0) {
  console.log(`[convert] skipped ${skipped.length} rows:`);
  for (const s of skipped) console.log(`  row ${s.row}: ${s.reason} — ${s.line}`);
} else {
  console.log('[convert] no rows skipped ✓');
}
