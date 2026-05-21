import { z } from 'zod';

export const CreateSeasonInput = z.object({
  name: z.string().trim().min(1, '赛季名称必填').max(40, '赛季名称过长'),
  teamBudget: z.number().positive('预算必须大于 0'),
});
export type CreateSeasonInput = z.infer<typeof CreateSeasonInput>;

export const UpdateSeasonInput = z.object({
  teamBudget: z.number().positive('预算必须大于 0'),
});
export type UpdateSeasonInput = z.infer<typeof UpdateSeasonInput>;
