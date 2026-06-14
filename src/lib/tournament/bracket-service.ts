import type { PrismaClient } from '@prisma/client';
import { confirmKnockoutSeeding, getKnockoutSeedingDraft } from './knockout-seeding-service';

/** Compatibility helper for old internal callers. New code should confirm manual seeding directly. */
export async function closeGroupStage(
  db: PrismaClient,
  input: { tournamentId: string; actorUserId: string },
): Promise<void> {
  const draft = await getKnockoutSeedingDraft(db, input.tournamentId);
  await confirmKnockoutSeeding(db, {
    tournamentId: input.tournamentId,
    slots: draft.defaultSlots,
    actorUserId: input.actorUserId,
  });
}
