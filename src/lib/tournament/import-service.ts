import { resolvePid, summarySchema } from './import-schema';
import type { Db } from './types';

type Candidate = { registrationId: string; gameId: string; nickname: string };
type MapRow = {
  capturedParticipantId: number;
  capturedName: string;
  lcuTeamId: number;
  siteTeamId: string;
  registrationId: string | null;
  candidates: Candidate[];
};

async function rosterByTeam(db: Db, tournamentId: string, teamId: string): Promise<Candidate[]> {
  const tt = await db.tournamentTeam.findFirst({ where: { tournamentId, teamId } });
  if (!tt) return [];
  const rows = await db.tournamentTeamPlayer.findMany({
    where: { tournamentTeamId: tt.id },
    include: { registration: { include: { player: true } } },
  });
  return rows.map((p) => ({
    registrationId: p.registrationId,
    gameId: p.registration.player.gameId,
    nickname: p.registration.nickname,
  }));
}

const norm = (s: string) => s.trim().toLowerCase();

export async function buildMapping(db: Db, matchId: string, blueTeamId: string, raw: unknown) {
  const s = summarySchema.parse(raw);
  const match = await db.match.findUniqueOrThrow({ where: { id: matchId } });
  if (![match.teamAId, match.teamBId].includes(blueTeamId))
    throw new Error('blueTeamId 不属于该对阵');
  const redTeamId = match.teamAId === blueTeamId ? match.teamBId! : match.teamAId!;
  const blue = await rosterByTeam(db, match.tournamentId, blueTeamId);
  const red = await rosterByTeam(db, match.tournamentId, redTeamId);
  const rows: MapRow[] = s.players.map((p, i) => {
    const isBlue = p.teamId === 100;
    const siteTeamId = isBlue ? blueTeamId : redTeamId;
    const candidates = isBlue ? blue : red;
    const hit = candidates.find((c) => norm(c.gameId) === norm(p.name));
    return {
      capturedParticipantId: resolvePid(p, i),
      capturedName: p.name,
      lcuTeamId: p.teamId,
      siteTeamId,
      registrationId: hit?.registrationId ?? null,
      candidates,
    };
  });
  return { matchId, blueTeamId, redTeamId, rows };
}

export function resolveImportAuth(
  bearer: string | null,
  isAdmin: boolean,
  envToken: string | undefined,
): { source: 'SCRIPT' | 'UPLOAD' } | { error: 401 } {
  if (envToken && bearer && bearer === envToken) return { source: 'SCRIPT' };
  if (isAdmin) return { source: 'UPLOAD' };
  return { error: 401 };
}

export async function ingestImport(db: Db, raw: unknown, source: 'SCRIPT' | 'UPLOAD') {
  const s = summarySchema.parse(raw);
  const dup = await db.matchImport.findFirst({
    where: { externalGameId: s.gameId, status: 'COMMITTED' },
    select: { id: true },
  });
  const row = await db.matchImport.create({
    data: {
      source,
      status: 'PENDING',
      externalGameId: s.gameId,
      gameVersion: s.gameVersion ?? null,
      gameMode: s.gameMode ?? null,
      gameType: s.gameType ?? null,
      queueId: s.queueId ?? null,
      mapId: s.mapId ?? null,
      gameCreation: s.gameCreation ?? null,
      durationSeconds: s.gameDuration ?? null,
      rawJson: raw as object,
    },
  });
  return {
    importId: row.id,
    externalGameId: row.externalGameId.toString(),
    duplicateOfCommitted: !!dup,
  };
}
