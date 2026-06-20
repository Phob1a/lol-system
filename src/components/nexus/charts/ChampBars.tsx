/** ChampBars — most-played champions with games bar + win-rate label.
 *  Ported from docs/design/nexus/prototype/lolcharts.jsx · ChampBars.
 *  No chart library. Pure HTML/CSS. */

export interface ChampBarsEntry {
  championName: string;
  games: number;
  /** Win rate percentage, e.g. 62 (not 0.62). */
  winRate: number;
  /** KDA string, e.g. "4.2". */
  kda: string;
}

export interface ChampBarsProps {
  champs: ChampBarsEntry[];
}

/**
 * ChampBars renders a vertical list of champions. Each row shows:
 * - champion name with win-rate label (green when ≥50%)
 * - a horizontal bar scaled to games relative to the max in the set
 * - games count and KDA at the right edge
 * All numbers use tabular-nums.
 */
export function ChampBars({ champs }: ChampBarsProps) {
  const maxG = Math.max(...champs.map((c) => c.games), 1);

  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {champs.map((ch, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {/* name + win-rate row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 3,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  color: 'rgb(var(--ink))',
                }}
              >
                {ch.championName}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  color:
                    ch.winRate >= 50
                      ? 'rgb(var(--good))'
                      : 'rgb(var(--dim))',
                }}
              >
                {ch.winRate}%
              </span>
            </div>

            {/* bar track */}
            <span
              style={{
                display: 'block',
                height: 5,
                background: 'rgb(var(--line))',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${(ch.games / maxG) * 100}%`,
                  background: 'rgb(var(--accent-n))',
                  boxShadow: '0 0 6px rgb(var(--accent-n) / 0.5)',
                }}
              />
            </span>
          </div>

          {/* meta: games + KDA */}
          <span
            style={{
              fontSize: 11,
              color: 'rgb(var(--faint))',
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            {ch.games} G · {ch.kda} KDA
          </span>
        </div>
      ))}
    </div>
  );
}
