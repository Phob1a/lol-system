import { z } from 'zod';

export const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;

const OptionalNickname = z
  .string()
  .trim()
  .max(20, '昵称过长')
  .refine((v) => v.length === 0 || v.length >= 2, '昵称至少 2 个字符')
  .optional();

export const PublicRegistrationInput = z
  .object({
    gameId: z.string().trim().min(2, '游戏 ID 至少 2 个字符').max(32, '游戏 ID 过长'),
    nickname: OptionalNickname,
    primaryPositions: z.array(z.enum(POSITIONS)).min(1, '至少选择一个主位置'),
    secondaryPositions: z.array(z.enum(POSITIONS)).default([]),
    currentRank: z.string().trim().min(1, '当前段位必填').max(20, '段位过长'),
    peakRank: z.string().trim().min(1, '历史最高段位必填').max(20, '段位过长'),
    willingToCaptain: z.boolean().default(false),
    statement: z.string().trim().max(200, '参赛宣言不超过 200 字').optional(),
    availability: z
      .string()
      .trim()
      .min(1, '请填写每周可参赛/训练时间')
      .max(200, '可参赛时间不超过 200 字'),
  })
  .refine(
    (d) => d.secondaryPositions.every((p) => !d.primaryPositions.includes(p)),
    { message: '副位置不能与主位置重复', path: ['secondaryPositions'] },
  );
export type PublicRegistrationInput = z.infer<typeof PublicRegistrationInput>;

export const AdminRegistrationPatch = z.object({
  nickname: z.string().trim().min(2).max(20).optional(),
  primaryPositions: z.array(z.enum(POSITIONS)).min(1).optional(),
  secondaryPositions: z.array(z.enum(POSITIONS)).optional(),
  currentRank: z.string().trim().min(1).max(20).optional(),
  peakRank: z.string().trim().min(1).max(20).optional(),
  willingToCaptain: z.boolean().optional(),
  statement: z.string().trim().max(200).optional(),
  availability: z.string().trim().max(200).optional(),
  cost: z.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'EXCLUDED']).optional(),
});
export type AdminRegistrationPatch = z.infer<typeof AdminRegistrationPatch>;

export const AdminRegistrationCreate = z.object({
  gameId: z.string().trim().min(2).max(32),
  nickname: OptionalNickname,
  primaryPositions: z.array(z.enum(POSITIONS)).min(1),
  secondaryPositions: z.array(z.enum(POSITIONS)).default([]),
  currentRank: z.string().trim().min(1).max(20),
  peakRank: z.string().trim().min(1).max(20),
  willingToCaptain: z.boolean().default(false),
  statement: z.string().trim().max(200).optional(),
  availability: z.string().trim().max(200).optional(),
  cost: z.number().min(0).default(0),
});
export type AdminRegistrationCreate = z.infer<typeof AdminRegistrationCreate>;
