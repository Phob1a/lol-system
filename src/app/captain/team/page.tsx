import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { TeamManager, type RosterRow } from '@/components/captain/TeamManager';

export const dynamic = 'force-dynamic';

// Roster display order, top to bottom.
const POSITION_ORDER: Record<string, number> = {
  TOP: 0,
  JUNGLE: 1,
  MID: 2,
  ADC: 3,
  SUPPORT: 4,
};

const OPEN = ['GROUPING', 'GROUP_STAGE', 'KNOCKOUT', 'FINISHED'];

export default async function CaptainTeamPage() {
  const session = await getSession();
  const teamId = session?.user.teamId;
  if (!teamId) redirect('/captain');

  const tournament = await getActiveTournament(prisma);
  if (!tournament || !OPEN.includes(tournament.status)) redirect('/captain');

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      slots: { include: { registration: { include: { player: true } } } },
    },
  });
  if (!team) {
    return <div className="text-muted-foreground">未找到你的队伍</div>;
  }
  // Reject past-tournament captain accounts.
  if (team.tournamentId !== tournament.id) redirect('/captain');

  const roster: RosterRow[] = [...team.slots]
    .sort((a, b) => (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99))
    .map((slot) => ({
      position: slot.position,
      nickname: slot.registration?.nickname ?? null,
      gameId: slot.registration?.player.gameId ?? null,
      cost: slot.registration?.cost ?? null,
      isCaptain: slot.registration?.isCaptain ?? false,
    }));

  return <TeamManager name={team.name} slogan={team.slogan} roster={roster} />;
}
