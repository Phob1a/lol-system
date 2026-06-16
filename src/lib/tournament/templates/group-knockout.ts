import { TournamentError } from '../errors';
import type { GroupKnockoutConfig, Skeleton, TournamentTemplate } from '../types';

const GROUP_NAMES = 'ABCDEFGH';
/** 出线规模 → 轮次序列（首轮在前） */
const ROUNDS: Record<number, string[]> = {
  2: ['FINAL'],
  4: ['SF', 'FINAL'],
  8: ['QF', 'SF', 'FINAL'],
  16: ['R16', 'QF', 'SF', 'FINAL'],
};
const ROUND_LABEL: Record<string, string> = { R16: '十六强', QF: '四分之一决赛', SF: '半决赛', FINAL: '决赛' };

function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

function validate(raw: unknown): GroupKnockoutConfig {
  const c = raw as GroupKnockoutConfig;
  if (c?.template !== 'group-knockout') throw new TournamentError('INVALID_CONFIG', '未知模板');
  const { groupCount, teamsPerGroup, advancingPerGroup } = c;
  for (const [k, v] of Object.entries({ groupCount, teamsPerGroup, advancingPerGroup })) {
    if (!Number.isInteger(v) || v < 1) throw new TournamentError('INVALID_CONFIG', `${k} 必须为正整数`);
  }
  if (groupCount > GROUP_NAMES.length) throw new TournamentError('INVALID_CONFIG', '最多 8 个组');
  if (teamsPerGroup < 2) throw new TournamentError('INVALID_CONFIG', '每组至少 2 队');
  if (advancingPerGroup >= teamsPerGroup)
    throw new TournamentError('INVALID_CONFIG', '出线数必须小于每组队数');
  const advancing = groupCount * advancingPerGroup;
  if (!isPowerOfTwo(advancing) || !ROUNDS[advancing])
    throw new TournamentError('INVALID_CONFIG', `出线总数 ${advancing} 必须是 2 的幂（2/4/8/16）`);
  for (const round of ROUNDS[advancing]) {
    const bo = c.knockoutBestOf?.[round];
    if (bo !== 1 && bo !== 3 && bo !== 5)
      throw new TournamentError('INVALID_CONFIG', `缺少轮次 ${round} 的 BO 配置`);
  }
  if (![1, 3, 5].includes(c.groupBestOf))
    throw new TournamentError('INVALID_CONFIG', '小组赛 BO 配置非法');
  return c;
}

function generate(teamCount: number, c: GroupKnockoutConfig): Skeleton {
  if (teamCount !== c.groupCount * c.teamsPerGroup)
    throw new TournamentError('INVALID_CONFIG', `需要 ${c.groupCount * c.teamsPerGroup} 支队伍，实际 ${teamCount}`);

  // —— 小组赛：每组单循环 ——
  const groupStageMatches: Skeleton['stages'][number]['matches'] = [];
  for (let g = 0; g < c.groupCount; g++) {
    for (let a = 0; a < c.teamsPerGroup; a++) {
      for (let b = a + 1; b < c.teamsPerGroup; b++) {
        groupStageMatches.push({
          key: `g${g}:${a}v${b}`,
          groupIndex: g,
          roundKey: null,
          label: `${GROUP_NAMES[g]} 组`,
          bestOf: c.groupBestOf,
          teamAIndex: a,
          teamBIndex: b,
        });
      }
    }
  }

  // —— 淘汰赛：按轮次铺空位比赛 + 胜者边 ——
  const advancing = c.groupCount * c.advancingPerGroup;
  const rounds = ROUNDS[advancing];
  const koMatches: Skeleton['stages'][number]['matches'] = [];
  const edges: Skeleton['edges'] = [];
  for (let r = 0; r < rounds.length; r++) {
    const count = advancing / 2 ** (r + 1);
    for (let i = 0; i < count; i++) {
      koMatches.push({
        key: `ko:${rounds[r]}:${i}`,
        groupIndex: null,
        roundKey: rounds[r],
        label: count === 1 ? ROUND_LABEL[rounds[r]] : `${ROUND_LABEL[rounds[r]]} ${i + 1}`,
        bestOf: c.knockoutBestOf[rounds[r]],
        teamAIndex: null,
        teamBIndex: null,
      });
      if (r > 0) {
        // 本轮第 i 场接收上一轮第 2i、2i+1 场的胜者
        edges.push({ fromKey: `ko:${rounds[r - 1]}:${2 * i}`, toKey: `ko:${rounds[r]}:${i}`, outcome: 'WINNER', slot: 'A' });
        edges.push({ fromKey: `ko:${rounds[r - 1]}:${2 * i + 1}`, toKey: `ko:${rounds[r]}:${i}`, outcome: 'WINNER', slot: 'B' });
      }
    }
  }

  // —— 种子映射：标准交叉（首轮第 i 场：seed[i] vs seed[N-1-i]）——
  // 出线序列按"名次优先、组序次之"：[A1,B1,…,A2,B2,…]。
  // 首尾配对天然交叉：2组2出线 → A1–B2 / B1–A2；4组2出线 → A1–D2 / B1–C2 / C1–B2 / D1–A2，
  // 且同组两队分属对位（半区）两端，不会在首轮相遇。
  const seeds: string[] = [];
  for (let rank = 1; rank <= c.advancingPerGroup; rank++) {
    for (let g = 0; g < c.groupCount; g++) {
      seeds.push(`${g}-${rank}`);
    }
  }
  const firstRound = rounds[0];
  const firstCount = advancing / 2;
  const seedMap: Skeleton['seedMap'] = {};
  for (let i = 0; i < firstCount; i++) {
    seedMap[seeds[i]] = { matchKey: `ko:${firstRound}:${i}`, slot: 'A' };
    seedMap[seeds[advancing - 1 - i]] = { matchKey: `ko:${firstRound}:${i}`, slot: 'B' };
  }

  return {
    stages: [
      { type: 'GROUP', name: '小组赛', order: 1, bestOf: c.groupBestOf, groups: Array.from({ length: c.groupCount }, (_, g) => ({ name: GROUP_NAMES[g] })), matches: groupStageMatches },
      { type: 'KNOCKOUT', name: '淘汰赛', order: 2, bestOf: c.knockoutBestOf[rounds[rounds.length - 1]], groups: [], matches: koMatches },
    ],
    edges,
    seedMap,
  };
}

export const groupKnockout: TournamentTemplate = { validate, generate };
