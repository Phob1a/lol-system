'use client';

import type { PublicState } from '@/hooks/useTournamentState';
import { useMatchDrawer } from '@/components/tournament/MatchDetailProvider';
import { BracketMap, type BracketStanding } from '@/components/nexus/charts/BracketMap';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Readout from '@/components/nexus/Readout';
import Kicker from '@/components/nexus/Kicker';

type Bracket = NonNullable<PublicState>['bracket'];
type Standings = NonNullable<PublicState>['standings'];
type Matches = NonNullable<PublicState>['matches'];

type Props = {
  bracket: Bracket;
  standings: Standings;
  matches: Matches;
};

const ROUND_LABEL: Record<string, string> = {
  R16: '十六强',
  QF: '四分之一决赛',
  SF: '半决赛',
  FINAL: '总决赛',
};

function getRoundLabel(roundKey: string): string {
  return ROUND_LABEL[roundKey] ?? roundKey;
}

/** KO bracket node — clickable card showing two teams + score */
function KoNode({
  matchId,
  label,
  gold,
  teamAName,
  teamBName,
  aWin,
  bWin,
  finished,
  bestOf,
  hasMatch,
}: {
  matchId: string | null;
  label: string;
  gold?: boolean;
  teamAName: string;
  teamBName: string;
  aWin: boolean;
  bWin: boolean;
  finished: boolean;
  bestOf?: number;
  hasMatch: boolean;
}) {
  const { openMatch } = useMatchDrawer();

  const teamRow = (name: string, win: boolean) => (
    <div
      className={[
        'flex items-center justify-between px-3 py-2',
        win
          ? 'bg-nexus-accent/10 border-l-2 border-nexus-accent'
          : 'border-l-2 border-transparent',
      ].join(' ')}
    >
      <span
        className={[
          'font-body text-[13px] truncate',
          win
            ? 'text-nexus-accent font-bold'
            : name === '待定'
            ? 'text-nexus-faint'
            : 'text-nexus-ink',
        ].join(' ')}
      >
        {name}
      </span>
      <Readout
        className={[
          'text-[13px] font-bold ml-3 shrink-0',
          win ? 'text-nexus-accent' : 'text-nexus-dim',
        ].join(' ')}
      >
        {finished ? (win ? '1' : '0') : '—'}
      </Readout>
    </div>
  );

  return (
    <button
      type="button"
      disabled={!hasMatch}
      onClick={() => matchId && openMatch(matchId)}
      className={[
        'block w-full text-left overflow-hidden',
        'bg-nexus-panel-2 border',
        gold ? 'border-nexus-gold/50' : 'border-nexus-line',
        'rounded-[var(--radius-nexus)]',
        hasMatch
          ? 'cursor-pointer hover:border-nexus-accent/50 transition-colors duration-100'
          : 'cursor-default',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* header */}
      <div className="flex items-center justify-between px-3 py-[6px] border-b border-nexus-line">
        <Kicker
          className={gold ? 'text-nexus-gold' : 'text-nexus-faint'}
        >
          {label}
        </Kicker>
        <Readout className="text-[9px] text-nexus-faint">
          {bestOf != null ? `BO${bestOf}` : '—'}
        </Readout>
      </div>
      {teamRow(teamAName, aWin)}
      <div className="h-px bg-nexus-line/50" />
      {teamRow(teamBName, bWin)}
    </button>
  );
}

// ---------------------------------------------------------------------------
// KoTree — SF1 / SF2 → FINAL with SVG connector lines
// Matches the nexus prototype KoTree layout.
// ---------------------------------------------------------------------------
function KoTreeLayout({
  sfRound,
  finalRound,
  resolveMatch,
  resolveTeamName,
}: {
  sfRound: Bracket[number];
  finalRound: Bracket[number];
  resolveMatch: (id: string) => Matches[number] | undefined;
  resolveTeamName: (teamId: string | null) => string;
}) {
  const sfMatches = sfRound.matches;
  const finalMatches = finalRound.matches;
  const sf1 = sfMatches[0];
  const sf2 = sfMatches[1] ?? null;
  const fin = finalMatches[0] ?? null;

  function nodeProps(m: Bracket[number]['matches'][number] | null, label: string, gold?: boolean) {
    if (!m) return null;
    const finished = m.status === 'FINISHED';
    const aW = finished && m.winnerTeamId !== null && m.winnerTeamId === m.teamAId;
    const bW = finished && m.winnerTeamId !== null && m.winnerTeamId === m.teamBId;
    const full = resolveMatch(m.id);
    return {
      matchId: m.id,
      label,
      gold,
      teamAName: resolveTeamName(m.teamAId),
      teamBName: resolveTeamName(m.teamBId),
      aWin: aW,
      bWin: bW,
      finished,
      bestOf: full?.bestOf,
      hasMatch: true,
    } as const;
  }

  const sf1Props = nodeProps(sf1, sf1?.label ?? '半决赛 1');
  const sf2Props = sf2 ? nodeProps(sf2, sf2?.label ?? '半决赛 2') : null;
  const finProps = fin ? nodeProps(fin, fin?.label ?? '总决赛', true) : null;

  return (
    // grid: [SF column] [connector 54px] [FINAL column]
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 54px 1fr',
        alignItems: 'center',
        padding: '14px 8px',
      }}
    >
      {/* SF column */}
      <div style={{ display: 'grid', gap: sf2Props ? 48 : 0 }}>
        {sf1Props && <KoNode {...sf1Props} />}
        {sf2Props && <KoNode {...sf2Props} />}
      </div>

      {/* Connector */}
      <div
        style={{
          position: 'relative',
          alignSelf: 'stretch',
          minHeight: 120,
        }}
      >
        {/* top horizontal arm — from SF1 mid to centre */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: '50%',
            top: sf2Props ? '25%' : '50%',
            borderTop: '2px solid rgb(var(--nexus-line, var(--line)))',
          }}
        />
        {/* bottom horizontal arm — from SF2 mid to centre */}
        {sf2Props && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: '50%',
              bottom: '25%',
              borderTop: '2px solid rgb(var(--nexus-line, var(--line)))',
            }}
          />
        )}
        {/* vertical join bar */}
        {sf2Props && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '25%',
              bottom: '25%',
              borderLeft: '2px solid rgb(var(--nexus-line, var(--line)))',
            }}
          />
        )}
        {/* horizontal arm to FINAL node */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            width: '50%',
            top: '50%',
            borderTop: '2px solid rgb(var(--nexus-accent, var(--accent)))',
          }}
        />
      </div>

      {/* FINAL column */}
      <div>
        {finProps ? (
          <KoNode {...finProps} />
        ) : (
          <div
            style={{
              border: '1px solid rgb(var(--nexus-gold, var(--gold)) / 0.4)',
              borderRadius: 'var(--radius-nexus, 3px)',
              padding: '14px 12px',
              background: 'rgb(var(--nexus-panel-2, var(--panel-2)))',
              textAlign: 'center',
            }}
          >
            <Kicker className="text-nexus-gold">总决赛</Kicker>
            <Readout className="text-nexus-faint text-[11px] mt-1">待定</Readout>
          </div>
        )}
      </div>
    </div>
  );
}

export function BracketView({ bracket, standings, matches }: Props) {
  // Build a unified team name map from standings and matches
  const teamNames = new Map<string, string>();

  for (const group of standings) {
    for (const [teamId, teamName] of Object.entries(group.teams)) {
      teamNames.set(teamId, teamName);
    }
  }
  for (const match of matches) {
    if (match.teamA) teamNames.set(match.teamA.id, match.teamA.name);
    if (match.teamB) teamNames.set(match.teamB.id, match.teamB.name);
  }

  function resolveName(teamId: string | null): string {
    if (!teamId) return '待定';
    return teamNames.get(teamId) ?? '待定';
  }

  function resolveMatch(id: string) {
    return matches.find((mx) => mx.id === id);
  }

  // Adapt standings for BracketMap (needs exactly 2 groups with rows having name+points)
  const bracketStandings: [BracketStanding, BracketStanding] | null =
    standings.length >= 2
      ? [
          {
            rows: standings[0].rows.map((r) => ({
              name: standings[0].teams[r.teamId] ?? r.teamId,
              points: r.points,
            })),
          },
          {
            rows: standings[1].rows.map((r) => ({
              name: standings[1].teams[r.teamId] ?? r.teamId,
              points: r.points,
            })),
          },
        ]
      : null;

  const hasBracketData = bracket.length > 0;

  // Detect SF + FINAL 2-round pattern for KoTree layout
  const sfRound = bracket.find((r) => r.roundKey === 'SF') ?? null;
  const finalRound = bracket.find((r) => r.roundKey === 'FINAL') ?? null;
  const useKoTree = sfRound !== null && finalRound !== null && bracket.length <= 2;

  // Empty state: no bracket AND no standings to show BracketMap
  if (!hasBracketData && !bracketStandings) {
    return (
      <p className="text-nexus-faint text-sm text-center py-8 font-mono">
        暂无对阵数据
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* BracketMap — 晋级星图 */}
      {bracketStandings && (
        <Panel scan>
          <PanelHead
            title="晋级星图 · 小组赛 → 淘汰赛"
            actions={
              <Readout className="text-[10px] text-nexus-faint">
                BRACKET
              </Readout>
            }
          />
          <div className="px-5 py-5">
            <BracketMap standings={bracketStandings} w={760} h={300} />
          </div>
        </Panel>
      )}

      {/* KO tree */}
      {hasBracketData && (
        <Panel>
          <PanelHead
            title="淘汰赛对阵树"
            actions={
              <Readout className="text-[10px] text-nexus-faint">
                点击查看单场
              </Readout>
            }
          />

          {/* KoTree layout for SF + FINAL (most common case) */}
          {useKoTree ? (
            <KoTreeLayout
              sfRound={sfRound!}
              finalRound={finalRound!}
              resolveMatch={resolveMatch}
              resolveTeamName={resolveName}
            />
          ) : (
            /* Generic horizontal scroll for other round structures */
            <div className="overflow-x-auto">
              <div className="flex gap-8 p-5 min-w-max">
                {bracket.map((round) => (
                  <div
                    key={round.roundKey}
                    className="flex flex-col gap-4 min-w-[200px]"
                  >
                    {/* round header */}
                    <div className="text-center pb-2 border-b border-nexus-line">
                      <Kicker className="text-nexus-faint">
                        {getRoundLabel(round.roundKey)}
                      </Kicker>
                    </div>

                    <div className="flex flex-col gap-3">
                      {round.matches.map((m) => {
                        const fin = m.status === 'FINISHED';
                        const aW =
                          fin &&
                          m.winnerTeamId !== null &&
                          m.winnerTeamId === m.teamAId;
                        const bW =
                          fin &&
                          m.winnerTeamId !== null &&
                          m.winnerTeamId === m.teamBId;
                        const isFinal = round.roundKey === 'FINAL';
                        const matchFull = resolveMatch(m.id);

                        return (
                          <KoNode
                            key={m.id}
                            matchId={m.id}
                            label={m.label ?? getRoundLabel(round.roundKey)}
                            gold={isFinal}
                            teamAName={resolveName(m.teamAId)}
                            teamBName={resolveName(m.teamBId)}
                            aWin={aW}
                            bWin={bW}
                            finished={fin}
                            bestOf={matchFull?.bestOf}
                            hasMatch={true}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
