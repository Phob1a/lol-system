import { z } from 'zod';

/** Captain-editable team profile fields. */
export const UpdateTeamProfileInput = z.object({
  name: z.string().trim().min(2, '队名至少 2 字').max(30, '队名过长'),
  slogan: z
    .string()
    .trim()
    .max(50, '口号过长')
    .optional()
    .transform((v) => v || null),
});
export type UpdateTeamProfileInput = z.infer<typeof UpdateTeamProfileInput>;
