import { z } from 'zod';

// 大整数（如 riot gameId）：number 分支必须是安全整数，否则 JSON.parse 阶段可能已丢精度，
// 失真的 externalGameId 会污染 COMMITTED 去重/唯一约束。超出安全范围的值只能走字符串路径。
const bigIntish = z
  .union([
    z.string().regex(/^\d+$/),
    z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger, '数值超出安全整数范围，请用字符串传递大整数'),
  ])
  .transform((v) => BigInt(v));

const playerSchema = z.object({
  name: z.string().min(1),
  championId: z.number().int().nonnegative(),
  teamId: z.number().int(),
  stats: z.record(z.any()),
  participantId: z.number().int().optional(),
  spell1Id: z.number().int().optional(),
  spell2Id: z.number().int().optional(),
  championName: z.string().optional(),
});

export const summarySchema = z.object({
  gameId: bigIntish,
  gameMode: z.string().optional(),
  gameType: z.string().optional(),
  queueId: z.number().int().optional(),
  mapId: z.number().int().optional(),
  gameVersion: z.string().optional(),
  gameCreation: bigIntish.optional(),
  gameDuration: z.number().int().optional(),
  teams: z.array(z.any()).optional(),
  players: z.array(playerSchema).length(10),
});
export type SummaryInput = z.infer<typeof summarySchema>;

// commit 请求体：把一局 staging 导入落入正式赛事结构。
// mappings 必须恰好 10 条（capturedParticipantId → 站内 registrationId）。
// 比赛数据只允许来自 LCU summary，不接受人工覆盖。
export const commitSchema = z
  .object({
    matchId: z.string().min(1),
    expectedVersion: z.number().int(),
    gameIndex: z.number().int().positive(),
    blueTeamId: z.string().min(1),
    mappings: z
      .array(
        z.object({
          capturedParticipantId: z.number().int(),
          registrationId: z.string().min(1),
        }),
      )
      .length(10),
  })
  .strict();
export type CommitInput = z.infer<typeof commitSchema>;

// pid 解析：优先 top-level participantId，其次 stats.participantId，最后队内顺序 index+1。
// mapping 与 commit 必须共用此函数，保证键一致。
export function resolvePid(
  p: { participantId?: number; stats: Record<string, unknown> },
  index: number,
): number {
  return (
    p.participantId ??
    (typeof p.stats?.participantId === 'number' ? (p.stats.participantId as number) : index + 1)
  );
}
