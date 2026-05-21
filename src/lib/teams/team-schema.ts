import { z } from 'zod';

/** Captain-editable team profile fields. */
export const UpdateTeamProfileInput = z.object({
  name: z.string().trim().min(1, '队名必填').max(20, '队名过长'),
  slogan: z
    .string()
    .trim()
    .max(50, '口号过长')
    .optional()
    .transform((v) => v || null),
});
export type UpdateTeamProfileInput = z.infer<typeof UpdateTeamProfileInput>;
