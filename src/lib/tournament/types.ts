import type { Prisma, PrismaClient } from '@prisma/client';

export type Db = PrismaClient | Prisma.TransactionClient;

/** group-knockout 模板参数（Tournament.config 的 JSON 形状） */
export type GroupKnockoutConfig = {
  template: 'group-knockout';
  groupCount: number;
  teamsPerGroup: number;
  advancingPerGroup: number;
  groupBestOf: 1 | 3 | 5;
  /** roundKey → bestOf，如 { QF: 3, SF: 3, FINAL: 5 }；轮次按出线规模可能从 R16 起 */
  knockoutBestOf: Record<string, 1 | 3 | 5>;
};

/** 模板 generate 输出的纯数据骨架（未落库，service 负责持久化） */
export type Skeleton = {
  stages: Array<{
    type: 'GROUP' | 'KNOCKOUT';
    name: string;
    order: number;
    bestOf: number;
    groups: Array<{ name: string }>;
    matches: Array<{
      /** 引用：g{组序}:{a}v{b} 组内对阵用组内队序；ko:{roundKey}:{n} 淘汰赛位 */
      key: string;
      groupIndex: number | null;
      roundKey: string | null;
      label: string;
      bestOf: number;
      /** 组内对阵：组内队伍下标；淘汰赛首轮空缺 */
      teamAIndex: number | null;
      teamBIndex: number | null;
    }>;
  }>;
  /** 晋级边：fromKey 比赛的胜者去 toKey 的 slot 位 */
  edges: Array<{ fromKey: string; toKey: string; outcome: 'WINNER'; slot: 'A' | 'B' }>;
  /** 小组排名 → 淘汰赛首轮位的种子映射："{组序}-{名次}" → { matchKey, slot } */
  seedMap: Record<string, { matchKey: string; slot: 'A' | 'B' }>;
};

export interface TournamentTemplate {
  validate(config: unknown): GroupKnockoutConfig; // 抛 TournamentError('INVALID_CONFIG')
  generate(teamCount: number, config: GroupKnockoutConfig): Skeleton;
}
