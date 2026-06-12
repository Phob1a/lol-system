import { z } from 'zod';

export const scheduleBatchSchema = z.object({
  items: z
    .array(
      z.object({
        matchId: z.string().min(1),
        expectedVersion: z.number().int(),
        scheduledAt: z.string().datetime().nullable(),
      }),
    )
    .min(1)
    .max(200),
});

export type ScheduleBatchBody = z.infer<typeof scheduleBatchSchema>;
