import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { computeLeaderboard, type LeaderboardGame } from '@/lib/tournament/leaderboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const season = await getActiveSeason(prisma);
  if (!season) return NextResponse.json({ rows: [] });
  const games = await prisma.game.findMany({
    where: { isDraft: false, match: { tournament: { seasonId: season.id } } },
    include: { playerStats: { include: { registration: { select: { id: true, nickname: true, playerId: true } } } } },
  });
  const input: LeaderboardGame[] = games.map((g) => ({
    isDraft: g.isDraft, winnerTeamId: g.winnerTeamId, mvpRegistrationId: g.mvpRegistrationId,
    playerStats: g.playerStats.map((s) => ({
      registrationId: s.registrationId, playerId: s.registration.playerId, teamId: s.teamId, championId: s.championId,
      kills: s.kills, deaths: s.deaths, assists: s.assists, cs: s.cs, damage: s.damage, gold: s.gold,
    })),
  }));
  const rows = computeLeaderboard(input);
  const nameByReg = new Map<string, string>();
  for (const g of games) for (const s of g.playerStats) nameByReg.set(s.registrationId, s.registration.nickname);
  return NextResponse.json({ rows: rows.map((r) => ({ ...r, nickname: nameByReg.get(r.registrationId) ?? '—' })) });
}
