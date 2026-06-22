/**
 * Human-readable Chinese labels + value formatting for the LCU import detail
 * viewer. Field keys are the raw camelCase LCU keys (players[].* and
 * players[].stats.* and teams[].*). Unmapped keys fall back to the raw key,
 * unmapped values to the default formatter.
 */
import { championKeyByNumericId, championName } from './champions';
import { itemName, runeName, summonerSpellName } from './ddragon';

/** 原始字段名 → 中文标签。未列出的回退到原始 key。 */
const FIELD_LABELS: Record<string, string> = {
  // player-level
  participantId: '位置序号',
  name: '召唤师名',
  teamId: '阵营',
  spell1Id: '召唤师技能 1',
  spell2Id: '召唤师技能 2',
  championId: '英雄',
  championName: '英雄名',
  // core stats
  win: '胜负',
  kills: '击杀',
  deaths: '死亡',
  assists: '助攻',
  champLevel: '英雄等级',
  goldEarned: '获得金币',
  goldSpent: '消耗金币',
  totalMinionsKilled: '补刀（小兵）',
  neutralMinionsKilled: '补刀（野怪）',
  neutralMinionsKilledTeamJungle: '己方野区补刀',
  neutralMinionsKilledEnemyJungle: '敌方野区补刀',
  visionScore: '视野得分',
  wardsPlaced: '插眼',
  wardsKilled: '排眼',
  sightWardsBoughtInGame: '购买侦察眼',
  visionWardsBoughtInGame: '购买控制眼',
  // items
  item0: '装备 1',
  item1: '装备 2',
  item2: '装备 3',
  item3: '装备 4',
  item4: '装备 5',
  item5: '装备 6',
  item6: '饰品',
  // runes
  perk0: '主系基石符文',
  perk1: '主系符文 2',
  perk2: '主系符文 3',
  perk3: '主系符文 4',
  perk4: '副系符文 1',
  perk5: '副系符文 2',
  perkPrimaryStyle: '主系',
  perkSubStyle: '副系',
  // combat
  totalDamageDealt: '总伤害',
  totalDamageDealtToChampions: '对英雄总伤害',
  physicalDamageDealtToChampions: '对英雄物理伤害',
  magicDamageDealtToChampions: '对英雄魔法伤害',
  trueDamageDealtToChampions: '对英雄真实伤害',
  totalDamageTaken: '承受伤害',
  physicalDamageTaken: '承受物理伤害',
  magicalDamageTaken: '承受魔法伤害',
  trueDamageTaken: '承受真实伤害',
  damageSelfMitigated: '伤害减免',
  damageDealtToTurrets: '对防御塔伤害',
  damageDealtToObjectives: '对目标伤害',
  totalHeal: '总治疗',
  totalUnitsHealed: '治疗单位数',
  timeCCingOthers: '控制时长（秒）',
  totalTimeCrowdControlDealt: '总控制时长',
  largestCriticalStrike: '最大暴击',
  longestTimeSpentLiving: '最长存活时长',
  // multikills / objectives
  doubleKills: '双杀',
  tripleKills: '三杀',
  quadraKills: '四杀',
  pentaKills: '五杀',
  largestMultiKill: '最高连杀',
  largestKillingSpree: '最大连续击杀',
  killingSprees: '连杀次数',
  turretKills: '推塔',
  inhibitorKills: '推水晶',
  firstBloodKill: '一血击杀',
  firstBloodAssist: '一血助攻',
  firstTowerKill: '一塔击杀',
  firstTowerAssist: '一塔助攻',
  firstInhibitorKill: '首个水晶击杀',
  // team-level
  bans: '禁用英雄',
  baronKills: '男爵击杀',
  dragonKills: '小龙击杀',
  riftHeraldKills: '峡谷先锋击杀',
  hordeKills: '虚空蝗虫击杀',
  towerKills: '推塔数',
  firstBaron: '首杀男爵',
  firstDargon: '首杀小龙',
  firstBlood: '一血',
  firstTower: '一塔',
  firstInhibitor: '首个水晶',
};

/** 字段名 → 中文标签（未知回退原 key）。 */
export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number'
    ? v
    : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))
      ? Number(v)
      : null;
}

/**
 * 把已知 ID 字段格式化成可读名称；返回 null 表示无特殊映射，调用方走默认格式化。
 */
export function formatLcuField(key: string, value: unknown): string | null {
  // items
  if (/^item[0-6]$/.test(key)) {
    const id = asNum(value);
    if (id === 0) return '空';
    const n = itemName(id);
    return n ? `${n}（${id}）` : null;
  }
  // summoner spells
  if (key === 'spell1Id' || key === 'spell2Id') {
    const n = summonerSpellName(asNum(value));
    return n ? `${n}（${value}）` : null;
  }
  // champion
  if (key === 'championId') {
    const id = asNum(value);
    const n = id != null ? championName(championKeyByNumericId(id) ?? '') : null;
    return n ? `${n}（${id}）` : null;
  }
  // team / side
  if (key === 'teamId') {
    const id = asNum(value);
    if (id === 100) return '蓝方（100）';
    if (id === 200) return '红方（200）';
    return null;
  }
  // runes
  if (/^perk[0-5]$/.test(key) || key === 'perkPrimaryStyle' || key === 'perkSubStyle') {
    const id = asNum(value);
    if (id === 0) return '未设置';
    const n = runeName(id);
    return n ? `${n}（${id}）` : null;
  }
  return null;
}
