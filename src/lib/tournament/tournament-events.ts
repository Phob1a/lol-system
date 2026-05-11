import type { PrismaClient, Prisma, TournamentEventType } from '@prisma/client';

export class ConcurrencyError extends Error {
  constructor(public tournamentId: string, public expected: number, public actual: number) {
    super(`Concurrency conflict on tournament ${tournamentId}: expected seq ${expected}, found ${actual}`);
  }
}

export class TournamentStateError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface AppendEventInput {
  tournamentId: string;
  expectedSeq: number;
  actorId: string;
  type: TournamentEventType;
  payload: Prisma.InputJsonValue;
  /** Mutations to run inside the same transaction, AFTER seq bump and BEFORE event insert. */
  mutate: (tx: Prisma.TransactionClient) => Promise<void>;
}

export interface AppendEventResult {
  seq: number;
  eventId: string;
}

/**
 * Append a tournament event with optimistic concurrency control.
 *
 *  - Reads current Tournament.seq.
 *  - Throws ConcurrencyError if expectedSeq !== current.
 *  - In a single transaction: bumps seq, runs mutate, inserts the event.
 */
export async function appendEvent(
  db: PrismaClient,
  input: AppendEventInput,
): Promise<AppendEventResult> {
  return db.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({
      where: { id: input.tournamentId },
      select: { seq: true },
    });
    if (!t) throw new TournamentStateError('NOT_FOUND', 'tournament not found');
    if (t.seq !== input.expectedSeq) {
      throw new ConcurrencyError(input.tournamentId, input.expectedSeq, t.seq);
    }
    const nextSeq = t.seq + 1;
    await tx.tournament.update({
      where: { id: input.tournamentId },
      data: { seq: nextSeq },
    });
    await input.mutate(tx);
    const ev = await tx.tournamentEvent.create({
      data: {
        tournamentId: input.tournamentId,
        type: input.type,
        payload: input.payload,
        actorId: input.actorId,
        seq: nextSeq,
      },
    });
    return { seq: nextSeq, eventId: ev.id };
  });
}
