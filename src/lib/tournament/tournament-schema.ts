import { z } from 'zod';

export const CreateTournamentInput = z.object({
  name: z.string().trim().min(1, '赛事名称必填').max(60, '赛事名称过长'),
  teamBudget: z.number().positive('预算必须大于 0'),
  kind: z.string().trim().min(1).max(20),
  config: z.object({}).passthrough(),
});
export type CreateTournamentInput = z.infer<typeof CreateTournamentInput>;

export const UpdateBudgetInput = z.object({
  teamBudget: z.number().positive('预算必须大于 0'),
});
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetInput>;
