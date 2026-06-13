import { expect, it } from 'vitest';
import {
  adminReservationCandidatesQuerySchema,
  reservationPatchSchema,
} from './reservation-schema';

it('accepts a concrete reservation datetime', () => {
  const r = reservationPatchSchema.safeParse({
    expectedVersion: 2,
    scheduledAt: '2026-06-13T12:30:00.000Z',
  });
  expect(r.success).toBe(true);
});

it('accepts null scheduledAt for clearing a reservation', () => {
  const r = reservationPatchSchema.safeParse({ expectedVersion: 2, scheduledAt: null });
  expect(r.success).toBe(true);
});

it('rejects missing scheduledAt because omit would be ambiguous', () => {
  const r = reservationPatchSchema.safeParse({ expectedVersion: 2 });
  expect(r.success).toBe(false);
});

it('rejects omitted expectedVersion', () => {
  expect(reservationPatchSchema.safeParse({ scheduledAt: null }).success).toBe(false);
});

it('rejects fractional expectedVersion', () => {
  const r = reservationPatchSchema.safeParse({
    expectedVersion: 2.5,
    scheduledAt: '2026-06-13T12:30:00.000Z',
  });
  expect(r.success).toBe(false);
});

it('requires tournamentId for admin candidate query', () => {
  expect(adminReservationCandidatesQuerySchema.safeParse({ tournamentId: 't1' }).success).toBe(true);
  expect(adminReservationCandidatesQuerySchema.safeParse({}).success).toBe(false);
});
