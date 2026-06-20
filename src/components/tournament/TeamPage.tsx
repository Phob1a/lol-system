'use client';

/**
 * TeamPage — 战队主页 (Screen 6).
 *
 * Client component: receives pre-aggregated data from the server page and
 * uses the useMatchDrawer() hook to open the slide-over match detail drawer.
 *
 * Sections:
 *  1. Dossier hero   — team name / slogan / record chips + WinDonut
 *  2. 首发阵容        — roster list with per-player KDA + FormDots recent-form
 *  3. 战力雷达        — CompareRadar (team vs league average)
 *  4. 战队英雄池      — ChampHeat top picks
 *  5. 赛程战绩        — match schedule/result rows, clickable → match drawer
 */

import React from 'react';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Kicker from '@/components/nexus/Kicker';
import Chip from '@/components/nexus/Chip';
import Readout from '@/components/nexus/Readout';
import { PosPip, type Position } from '@/components/nexus/PosPip';
import WinDonut from '@/components/nexus/charts/WinDonut';
import CompareRadar from '@/components/nexus/charts/CompareRadar';
import { ChampHeat } from '@/components/nexus/charts/ChampHeat';
import { FormDots } from '@/components/nexus/charts/FormDots';
import { useMatchDrawer } from '@/components/tournament/MatchDetailProvider';
import type { TeamPageData } from '@/lib/tournament/team-page-service';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const POSITIONS: Position[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

const POS_LABEL: Record<Position, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MID: '中单',
  ADC: '射手',
  SUPPORT: '辅助',
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mn}`;
}

function isValidPosition(p: string): p is Position {
  return POSITIONS.includes(p as Position);
}

// ---------------------------------------------------------------------------
// Radar labels (matching prototype pubextra.jsx)
// ---------------------------------------------------------------------------

const RADAR_LABELS = ['KDA', '胜率', '击杀', '经济', '补刀'];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Hero panel at the top — team identity + record chips + WinDonut */
function HeroPanel({ data }: { data: TeamPageData }) {
  const rec = data.record;
  const winPct = Math.round(data.winRate);

  return (
    <Panel glow className="p-5">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 20,
          alignItems: 'center',
        }}
      >
        {/* left: identity */}
        <div style={{ minWidth: 0 }}>
          <Kicker className="mb-2 block">
            TEAM DOSSIER · {data.teamId.toUpperCase().slice(0, 12)}
          </Kicker>

          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 40,
              lineHeight: 0.92,
              color: 'rgb(var(--ink))',
              textTransform: 'uppercase',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {data.teamName}
          </div>

          {data.slogan && (
            <div
              style={{
                fontFamily: 'var(--font-serif, var(--font-body))',
                fontStyle: 'italic',
                fontSize: 15,
                color: 'rgb(var(--dim))',
                marginTop: 6,
              }}
            >
              &ldquo;{data.slogan}&rdquo;
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {rec?.groupName && (
              <Chip variant="ac">{rec.groupName} 组</Chip>
            )}
            {data.captainNickname && (
              <Chip>队长 {data.captainNickname}</Chip>
            )}
            {rec ? (
              <Chip variant="good">战绩 {rec.wins}–{rec.losses}</Chip>
            ) : (
              <Chip>暂无战绩</Chip>
            )}
            {rec && <Chip>积分 {rec.points}</Chip>}
            <Chip>
              余额&nbsp;
              <Readout>{data.budgetLeft.toFixed(0)}</Readout> CR
            </Chip>
          </div>
        </div>

        {/* right: win donut */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <WinDonut pct={winPct} size={120} />
          <Kicker className="block mt-2">队伍胜率</Kicker>
        </div>
      </div>
    </Panel>
  );
}

/** Single roster row */
function RosterRow({
  slot,
  stats,
  isLast,
}: {
  slot: TeamPageData['slots'][number];
  stats: TeamPageData['rosterStats'][number] | undefined;
  isLast: boolean;
}) {
  const pos = slot.position;
  const reg = slot.registration;
  const posValid = isValidPosition(pos);
  const posLabel = posValid ? POS_LABEL[pos] : pos;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
        alignItems: 'center',
        gap: 11,
        padding: '11px 16px',
        borderBottom: isLast ? 'none' : '1px solid rgb(var(--line) / 0.4)',
      }}
    >
      {/* position pip */}
      {posValid ? (
        <PosPip pos={pos} on={!!reg} size={28} />
      ) : (
        <span
          style={{
            width: 28,
            height: 28,
            display: 'inline-grid',
            placeItems: 'center',
            border: '1px solid rgb(var(--line))',
            fontSize: 11,
            color: 'rgb(var(--faint))',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {pos[0]}
        </span>
      )}

      {/* name + subtitle */}
      <div style={{ minWidth: 0 }}>
        {reg ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'rgb(var(--ink))',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {reg.nickname}
            </span>
            {reg.isCaptain && (
              <span style={{ fontSize: 11, color: 'rgb(var(--gold))' }}>★</span>
            )}
          </div>
        ) : (
          <Readout className="text-nexus-faint text-xs">空缺</Readout>
        )}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgb(var(--faint))',
            marginTop: 1,
          }}
        >
          {posLabel}
          {stats && stats.games > 0 && (
            <>
              {' '}· KDA&nbsp;
              <Readout>{stats.kda.toFixed(2)}</Readout>
            </>
          )}
        </div>
      </div>

      {/* recent form dots */}
      {stats && stats.recentForm.length > 0 ? (
        <FormDots form={stats.recentForm.slice(0, 6)} size={13} />
      ) : (
        <span />
      )}

      {/* cost */}
      {reg ? (
        <Readout className="text-nexus-accent text-xs">
          {reg.cost.toFixed(0)} CR
        </Readout>
      ) : (
        <Readout className="text-nexus-faint text-xs">—</Readout>
      )}
    </div>
  );
}

/** 首发阵容 panel */
function RosterPanel({ data }: { data: TeamPageData }) {
  const statsById = new Map(
    data.rosterStats.map((s) => [s.registrationId, s]),
  );
  const filled = data.slots.filter((s) => s.registration).length;

  return (
    <Panel>
      <PanelHead title={`首发阵容 · ${filled}`} />
      <div>
        {data.slots.length > 0 ? (
          data.slots.map((slot, i) => {
            const stats = slot.registration
              ? statsById.get(slot.registration.id)
              : undefined;
            return (
              <RosterRow
                key={`${slot.position}-${i}`}
                slot={slot}
                stats={stats}
                isLast={i === data.slots.length - 1}
              />
            );
          })
        ) : (
          <div
            style={{
              padding: 16,
              color: 'rgb(var(--faint))',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }}
          >
            尚无阵容数据
          </div>
        )}
      </div>
    </Panel>
  );
}

/** 战力雷达 panel */
function RadarPanel({ data }: { data: TeamPageData }) {
  const hasData = data.teamRadar.some((v) => v > 0);

  return (
    <Panel>
      <PanelHead
        title="战力雷达 · 对比联盟均值"
        actions={
          <Kicker className="text-[9px]">
            <span style={{ color: 'rgb(var(--accent-n))' }}>■</span>{' '}队伍
            &nbsp;
            <span style={{ color: 'rgb(var(--accent-n2))' }}>■</span>{' '}均值
          </Kicker>
        }
      />
      <div
        style={{
          padding: 16,
          display: 'grid',
          placeItems: 'center',
          minHeight: 260,
        }}
      >
        {hasData ? (
          <CompareRadar
            a={data.teamRadar}
            b={data.leagueRadar}
            labels={RADAR_LABELS}
            size={230}
          />
        ) : (
          <Readout className="text-nexus-faint text-xs">暂无对战数据</Readout>
        )}
      </div>
    </Panel>
  );
}

/** 战队英雄池 panel */
function ChampPoolPanel({ data }: { data: TeamPageData }) {
  const rows = data.champPool.map((c) => ({
    name: c.championDisplayName ?? c.championId,
    games: c.games,
    winRate: c.winRate,
  }));

  return (
    <Panel>
      <PanelHead title="战队英雄池" />
      <div style={{ padding: 16 }}>
        {rows.length > 0 ? (
          <ChampHeat rows={rows} />
        ) : (
          <Readout className="text-nexus-faint text-xs">暂无英雄数据</Readout>
        )}
      </div>
    </Panel>
  );
}

/** Match result row in 赛程战绩 */
function MatchRow({
  m,
  onOpen,
  isLast,
}: {
  m: TeamPageData['matches'][number];
  onOpen: (id: string) => void;
  isLast: boolean;
}) {
  const isFinished = m.status === 'FINISHED' || m.status === 'WALKOVER';
  const label = m.label ?? m.status;
  const opp = m.opponentName ?? '待定';

  return (
    <button
      onClick={() => onOpen(m.id)}
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 64px 1fr auto auto',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '11px 16px',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: isLast ? 'none' : '1px solid rgb(var(--line) / 0.35)',
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        color: 'inherit',
      }}
      className="hover:bg-[rgb(var(--panel-2)/0.6)] transition-colors"
    >
      <Readout className="text-nexus-faint text-[11px]">
        {fmtDateTime(m.scheduledAt)}
      </Readout>

      <Chip>{label.slice(0, 6)}</Chip>

      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'rgb(var(--ink))',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        vs {opp}
      </span>

      {isFinished ? (
        m.isWin === true ? (
          <Chip variant="good">胜</Chip>
        ) : m.isWin === false ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 20,
              padding: '0 7px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              border: '1px solid rgb(var(--bad) / 0.5)',
              color: 'rgb(var(--bad))',
              borderRadius: 'var(--radius-nexus)',
            }}
          >
            负
          </span>
        ) : (
          <Chip>完赛</Chip>
        )
      ) : (
        <Chip variant="ac">待赛</Chip>
      )}

      <Readout className="text-nexus-faint text-[13px]">▸</Readout>
    </button>
  );
}

/** 赛程战绩 panel */
function SchedulePanel({
  data,
  onOpenMatch,
}: {
  data: TeamPageData;
  onOpenMatch: (id: string) => void;
}) {
  return (
    <Panel>
      <PanelHead title={`赛程战绩 · ${data.matches.length}`} />
      <div>
        {data.matches.length > 0 ? (
          data.matches.map((m, i) => (
            <MatchRow
              key={m.id}
              m={m}
              onOpen={onOpenMatch}
              isLast={i === data.matches.length - 1}
            />
          ))
        ) : (
          <div
            style={{
              padding: 16,
              color: 'rgb(var(--faint))',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }}
          >
            暂无赛程数据
          </div>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface TeamPageProps {
  data: TeamPageData;
}

export function TeamPage({ data }: TeamPageProps) {
  const { openMatch } = useMatchDrawer();

  return (
    <div
      style={{
        padding: 22,
        display: 'grid',
        gap: 18,
      }}
    >
      {/* 1. Dossier hero */}
      <HeroPanel data={data} />

      {/* 2+3+4. Two-column: roster | (radar + champ pool) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <RosterPanel data={data} />

        <div style={{ display: 'grid', gap: 18 }}>
          <RadarPanel data={data} />
          <ChampPoolPanel data={data} />
        </div>
      </div>

      {/* 5. Schedule / results */}
      <SchedulePanel data={data} onOpenMatch={openMatch} />
    </div>
  );
}

export default TeamPage;
