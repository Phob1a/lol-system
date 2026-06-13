import { z } from 'zod';

export const reservationPatchSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  scheduledAt: z.string().datetime().nullable(),
});

export const adminReservationCandidatesQuerySchema = z.object({
  tournamentId: z.string().min(1),
});

export type ReservationPatchBody = z.infer<typeof reservationPatchSchema>;
