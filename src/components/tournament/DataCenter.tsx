'use client';

/**
 * DataCenter — 数据中心 / DATA CENTER (Screen 7, public side).
 *
 * Ported from docs/design/nexus/prototype/pubextra.jsx · DataCenter.
 *
 * Sections:
 *   1. 4 KPI tiles (total games / players / teams / champions played)
 *   2. 英雄登场率 TOP 10 — ChampHeat bars
 *   3. 位置 Meta 甜甜圈 — MetaDonut donut chart
 *   4. MVP 看板 — top-5 MVP earners
 *   5. 战力排行表 — power-ranking table (rows clickable → /tournament/team/[teamId])
 *
 * Receives plain serialised props from the server page (no Prisma in this file).
 * Motion is gated behind prefers-reduced-motion via the nexus CSS.
 */

import Link from 'next/link';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import DTile from '@/components/nexus/DTile';
import Kicker from '@/components/nexus/Kicker';
import { ChampHeat } from '@/components/nexus/charts/ChampHeat';
import MetaDonut from '@/components/nexus/charts/MetaDonut';
import type {
  MetaKpi,
  ChampHeatRow,
  PositionSlice,
  MvpBoardEntry,
  PowerRankRow,
} from '@/lib/tournament/meta-stats-service';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface DataCenterProps {
  kpi: MetaKpi;
  champHeat: ChampHeatRow[];
  positionMeta: PositionSlice[];
  mvpBoard: MvpBoardEntry[];
  powerRanking: PowerRankRow[];
}

// ─── Medal colours for MVP podium ─────────────────────────────────────────────

const MEDAL_COLORS = [
  'rgb(var(--gold))',
  'rgb(var(--dim))',
  'rgb(var(--hot))',
];

// ─── Component ─────────────────────────────────────────────────────────────────

export function DataCenter({
  kpi,
  champHeat,
  positionMeta,
  mvpBoard,
  powerRanking,
}: DataCenterProps) {
  return (
    <div className="grid gap-[18px] p-3 min-[430px]:p-[18px] min-[1180px]:p-[22px]">
      {/* ── 1. KPI tiles ─────────────────────────────────────────────────────── */}
      <div className="grid gap-[12px] grid-cols-2 min-[560px]:grid-cols-4">
        <DTile
          label="对局总数"
          value={kpi.totalGames}
          sub="已完赛"
        />
        <DTile
          label="选手人数"
          value={kpi.totalPlayers}
          sub="已注册"
        />
        <DTile
          label="参赛队伍"
          value={kpi.totalTeams}
          sub="战队总数"
        />
        <DTile
          label="登场英雄"
          value={kpi.totalChampions}
          sub="英雄池广度"
        />
      </div>

      {/* ── 2+3+4 — two-column row: LEFT champ heat · RIGHT donut+mvp ──────── */}
      <div className="grid items-start gap-[18px] grid-cols-1 min-[1180px]:grid-cols-[1.3fr_1fr]">
        {/* ── 2. Champion heat ──────────────────────────────────────────────── */}
        <Panel>
          <PanelHead
            title="英雄登场率 · TOP 10"
            actions={
              <Kicker style={{ fontSize: 9 }}>PICK RATE</Kicker>
            }
          />
          <div style={{ padding: 16 }}>
            {champHeat.length > 0 ? (
              <ChampHeat rows={champHeat} />
            ) : (
              <EmptyNote>暂无对局数据</EmptyNote>
            )}
          </div>
        </Panel>

        {/* RIGHT column: donut + MVP stacked */}
        <div style={{ display: 'grid', gap: 18 }}>
          {/* ── 3. Position meta donut ──────────────────────────────────────── */}
          <Panel>
            <PanelHead title="位置 Meta · 分布" />
            <div style={{ padding: 18 }}>
              {positionMeta.length > 0 ? (
                <MetaDonut data={positionMeta} size={150} />
              ) : (
                <EmptyNote>暂无选手注册数据</EmptyNote>
              )}
            </div>
          </Panel>

          {/* ── 4. MVP board ─────────────────────────────────────────────────── */}
          <Panel scan>
            <PanelHead title="MVP 看板" />
            <div style={{ padding: '6px 0' }}>
              {mvpBoard.length > 0 ? (
                mvpBoard.map((entry, i) => (
                  <div
                    key={entry.registrationId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 1fr auto',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 16px',
                      borderBottom:
                        i < mvpBoard.length - 1
                          ? '1px solid rgb(var(--line) / 0.35)'
                          : 'none',
                    }}
                  >
                    {/* Rank number */}
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 13,
                        fontWeight: 700,
                        color: MEDAL_COLORS[i] ?? 'rgb(var(--faint))',
                      }}
                    >
                      {i + 1}
                    </span>

                    {/* Nickname + team */}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 13,
                          color: 'rgb(var(--ink))',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.nickname}
                      </div>
                      {entry.teamName && (
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            color: 'rgb(var(--faint))',
                          }}
                        >
                          {entry.teamName}
                        </div>
                      )}
                    </div>

                    {/* MVP count */}
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'rgb(var(--gold))',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ★ {entry.mvpCount}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '12px 16px' }}>
                  <EmptyNote>暂无 MVP 数据</EmptyNote>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* ── 5. Power ranking table ───────────────────────────────────────────── */}
      <Panel>
        <PanelHead
          title={`战力排行 · ${powerRanking.length} 队`}
          actions={
            <Kicker style={{ fontSize: 9 }}>点击进入战队主页</Kicker>
          }
        />

        {powerRanking.length === 0 ? (
          <div style={{ padding: '20px 16px' }}>
            <EmptyNote>暂无队伍数据</EmptyNote>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}
              aria-label="战力排行榜"
            >
            <thead>
              <tr>
                {[
                  { label: '#',        align: 'left'   },
                  { label: '战队',     align: 'left'   },
                  { label: '组',       align: 'left'   },
                  { label: '胜',       align: 'center' },
                  { label: '负',       align: 'center' },
                  { label: '积分',     align: 'center' },
                  { label: '场均KDA',  align: 'center' },
                  { label: '场均经济', align: 'center' },
                ].map((col) => (
                  <th
                    key={col.label}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9.5,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgb(var(--faint))',
                      fontWeight: 600,
                      textAlign: col.align as 'left' | 'center',
                      padding: '10px 14px',
                      borderBottom: '1px solid rgb(var(--line))',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {powerRanking.map((row, i) => (
                <PowerRankTableRow
                  key={row.teamId}
                  row={row}
                  index={i}
                  total={powerRanking.length}
                />
              ))}
            </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ─── Power-ranking table row (navigates to team page) ─────────────────────────

function PowerRankTableRow({
  row,
  index,
  total,
}: {
  row: PowerRankRow;
  index: number;
  total: number;
}) {
  const isLast = index === total - 1;
  const cellStyle: React.CSSProperties = {
    padding: '11px 14px',
    borderBottom: isLast ? 'none' : '1px solid rgb(var(--line) / 0.35)',
  };

  return (
    <tr
      style={{
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background =
          'rgb(var(--accent-n) / 0.06)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
      }}
    >
      {/* Rank */}
      <td style={cellStyle}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
            fontSize: 13,
            color: 'rgb(var(--accent-n))',
          }}
        >
          {index + 1}
        </span>
      </td>

      {/* Team name — clickable Link */}
      <td style={cellStyle}>
        <Link
          href={`/tournament/team/${row.teamId}`}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13.5,
            color: 'rgb(var(--ink))',
            textDecoration: 'none',
          }}
        >
          {row.name}
        </Link>
      </td>

      {/* Group */}
      <td style={cellStyle}>
        {row.groupName ? (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '2px 7px',
              border: '1px solid rgb(var(--line))',
              color: 'rgb(var(--dim))',
            }}
          >
            {row.groupName}
          </span>
        ) : (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'rgb(var(--faint))',
            }}
          >
            —
          </span>
        )}
      </td>

      {/* Wins */}
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 13,
            color: 'rgb(var(--good))',
          }}
        >
          {row.wins}
        </span>
      </td>

      {/* Losses */}
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 13,
            color: 'rgb(var(--bad))',
          }}
        >
          {row.losses}
        </span>
      </td>

      {/* Points */}
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
            fontSize: 13,
            color: 'rgb(var(--ink))',
          }}
        >
          {row.points}
        </span>
      </td>

      {/* Avg KDA */}
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 13,
            color: 'rgb(var(--accent-n))',
          }}
        >
          {row.avgKda !== null ? row.avgKda.toFixed(2) : '—'}
        </span>
      </td>

      {/* Avg Gold */}
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 13,
            color: 'rgb(var(--dim))',
          }}
        >
          {row.avgGold !== null
            ? `${(row.avgGold / 1000).toFixed(1)}K`
            : '—'}
        </span>
      </td>
    </tr>
  );
}

// ─── Empty state helper ────────────────────────────────────────────────────────

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'rgb(var(--faint))',
      }}
    >
      {children}
    </span>
  );
}
