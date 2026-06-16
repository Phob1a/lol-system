import { z } from 'zod';

const bigIntish = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
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
