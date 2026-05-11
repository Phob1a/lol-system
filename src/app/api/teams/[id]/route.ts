import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { renameTeam, TeamRenameError } from '@/lib/teams/rename-service';
import { publish } from '@/server/tournament-bus';

export const runtime = 'nodejs';

const Body = z.object({ name: z.string() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: teamId } = await ctx.params;
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { captain: { include: { user: true } } },
  });
  if (!team) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  const isOwner = team.captain.user.id === session.user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const input = Body.parse(await req.json());
    await renameTeam(db, { teamId, newName: input.name });
    // Notify any active tournament viewers
    const gt = await db.groupTeam.findUnique({
      where: { teamId },
      include: { group: { include: { tournament: true } } },
    });
    if (gt) {
      publish({
        type: 'state.invalidated',
        tournamentId: gt.group.tournamentId,
        seq: gt.group.tournament.seq,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TeamRenameError) {
      const status = e.code === 'DUPLICATE' ? 409 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    if ((e as { name?: string }).name === 'ZodError') {
      return NextResponse.json({ error: 'validation failed' }, { status: 400 });
    }
    console.error('rename failed', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
