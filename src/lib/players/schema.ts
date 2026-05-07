import { z } from 'zod';

export const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;
export type PositionLiteral = (typeof POSITIONS)[number];

export const PlayerInput = z.object({
  gameId: z
    .string()
    .trim()
    .min(1, '游戏 ID 不能为空')
    .max(64, '游戏 ID 不超过 64 位')
    .regex(/^[A-Za-z0-9_\-一-龥#]+$/u, '游戏 ID 仅支持中英文/数字/下划线/连字符/井号'),
  nickname: z.string().trim().min(1, '昵称不能为空').max(32, '昵称不超过 32 位'),
  primaryPositions: z
    .array(z.enum(POSITIONS))
    .min(1, '至少选择一个主位置')
    .max(POSITIONS.length),
  secondaryPositions: z
    .array(z.enum(POSITIONS))
    .max(POSITIONS.length),
  cost: z.coerce
    .number()
    .min(0, '费用不能为负'),
  isCaptain: z.coerce.boolean(),
  isRetired: z.coerce.boolean(),
});

export type PlayerInputType = z.infer<typeof PlayerInput>;

// Used by PATCH where every field is optional.
export const PlayerPatch = PlayerInput.partial();
export type PlayerPatchType = z.infer<typeof PlayerPatch>;

// Dedup positions (input may contain duplicates from CSV imports).
export function dedupPositions(input: PlayerInputType): PlayerInputType {
  return {
    ...input,
    primaryPositions: Array.from(new Set(input.primaryPositions)),
    secondaryPositions: Array.from(new Set(input.secondaryPositions)),
  };
}
