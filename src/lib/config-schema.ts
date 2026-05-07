import { z } from 'zod';

export const ConfigPatch = z.object({
  teamBudget: z.coerce.number().min(0.01).max(100000).optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type ConfigPatchType = z.infer<typeof ConfigPatch>;
