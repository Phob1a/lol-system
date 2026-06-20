import { prisma } from '@/lib/db';
import { getActiveTournament, listTournaments } from '@/lib/tournament/tournament-service';
import { listTournamentTeams } from '@/lib/teams/team-service';
import { TournamentAdmin } from '@/components/admin/tournament/TournamentAdmin';
import { TournamentManager } from '@/components/admin/TournamentManager';

export const dynamic = 'force-dynamic';

export default async function AdminTournamentPage() {
  const [tournament, tournaments] = await Promise.all([
    getActiveTournament(prisma),
    listTournaments(prisma),
  ]);

  const teams = tournament ? await listTournamentTeams(prisma, tournament.id) : [];
  const teamList = teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="space-y-8">
      <TournamentManager initialTournaments={tournaments} />
      {tournament && (
        <div className="border-t border-cyan-200/20 pt-8">
          <TournamentAdmin tournamentId={tournament.id} teams={teamList} />
        </div>
      )}
    </div>
  );
}
