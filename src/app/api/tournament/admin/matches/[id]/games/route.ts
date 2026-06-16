import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { saveGameDetail } from '@/lib/tournament/game-detail-service';
import { toResponse } from '@/lib/tournament/route-errors';
import { publishTournament } from '@/server/tournament-bus';

const banSchema = z.object({
  teamId: z.string().min(1), type: z.enum(['BAN', 'PICK']),
  championId: z.string().min(1), order: z.number().int().positive(),
});
const statSchema = z.object({
  teamId: z.string().min(1), registrationId: z.string().min(1), championId: z.string().min(1),
  kills: z.number().int().nonnegative(), deaths: z.number().int().nonnegative(), assists: z.number().int().nonnegative(),
  cs: z.number().int().nonnegative(), damage: z.number().int().nonnegative(), gold: z.number().int().nonnegative(),
});

// 三态 crux：.nullish() = undefined | null | value。
// 省略 key → undefined（保留）；显式 null → 清空；array/value → 设置。
// 绝不能用 .default() —— 会把 undefined 折叠成具体值，破坏「保留」语义。
const bodySchema = z.object({
  expectedVersion: z.number().int(),
  gameId: z.string().min(1).optional(),
  detail: z.object({
    winnerTeamId: z.string().min(1).nullish(),
    blueTeamId: z.string().min(1).nullish(),
    durationSeconds: z.number().int().nullish(),
    mvpRegistrationId: z.string().min(1).nullish(),
    bans: z.array(banSchema).nullish(),
    playerStats: z.array(statSchema).nullish(),
  }),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  try {
    const body = bodySchema.parse(await req.json());
    const res = await saveGameDetail(prisma, {
      matchId: id, gameId: body.gameId, expectedVersion: body.expectedVersion,
      detail: body.detail, actorUserId: guard.session.user.id,
    });
    publishTournament({ type: 'tournament.invalidated' });
    return NextResponse.json({ ok: true, gameId: res.gameId });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: '参数错误' }, { status: 422 });
    return toResponse(e);
  }
}
