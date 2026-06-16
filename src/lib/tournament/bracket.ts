export type BracketMatch = {
  id: string;
  roundKey: string | null;
  label: string | null;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  status: string;
};

export type BracketRound = { roundKey: string; matches: BracketMatch[] };

const ROUND_ORDER = ['R16', 'QF', 'SF', 'FINAL'];

export function buildBracket(matches: BracketMatch[]): BracketRound[] {
  return ROUND_ORDER.filter((r) => matches.some((m) => m.roundKey === r)).map((roundKey) => ({
    roundKey,
    matches: matches
      .filter((m) => m.roundKey === roundKey)
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'zh')),
  }));
}
