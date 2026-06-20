'use client';

/**
 * OverviewDashboard — client component for the 观测总览 (Overview) screen.
 * Receives pre-fetched plain props from the server component in page.tsx.
 * Faithfully ports prototype/screens.jsx OverviewScreen using nexus primitives.
 */

import { useRouter } from 'next/navigation';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import DTile from '@/components/nexus/DTile';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import LiveDot from '@/components/nexus/LiveDot';
import { SegBudget } from '@/components/nexus/charts/SegBudget';
import { TrajectoryLine } from '@/components/nexus/charts/TrajectoryLine';
import { GroupBars } from '@/components/nexus/charts/GroupBars';
import { Orrery, type OrreryBody } from '@/components/nexus/charts/Orrery';
import { Sparkline } from '@/components/nexus/charts/Sparkline';
import type { OverviewProps } from './overview-data';

const STATUS_LABEL: Record<string, string> = {
  GROUP_STAGE: 'GROUP STAGE · 小组赛',
  KNOCKOUT: 'KNOCKOUT · 淘汰赛',
  FINISHED: 'FINISHED · 已结束',
  DRAFTING: 'DRAFTING · 选秀',
  GROUPING: 'GROUPING · 分组',
  ROSTER_LOCKED: 'ROSTER LOCKED · 阵容确认',
  REGISTRATION: 'REGISTRATION · 报名',
  SETUP: 'SETUP · 筹备',
};

const DRAFT_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: '未开始',
  IN_PROGRESS: '进行中',
  PAUSED: '已暂停',
  FINISHED: '已结束',
};

function statusChipVariant(status: string): 'ac' | 'good' | 'hot' | 'default' {
  if (status === 'GROUP_STAGE' || status === 'KNOCKOUT') return 'hot';
  if (status === 'FINISHED') return 'good';
  return 'ac';
}

export function OverviewDashboard({ props }: { props: OverviewProps }) {
  const router = useRouter();
  const {
    tournamentName,
    tournamentStatus,
    tournamentKind,
    matchCount,
    finishedCount,
    registrationCount,
    captainIntentionCount,
    teamCount,
    draftStatus,
    standings,
    teams,
    leaderboard,
    trajectoryPoints,
    trajectoryCurrentIndex,
  } = props;

  const finishedFrac = matchCount > 0 ? finishedCount / matchCount : 0;
  const finishedPct = Math.round(finishedFrac * 100);

  // Build Orrery bodies: distribute teams across 4 rings
  const orreryBodies: OrreryBody[] = teams.map((t, i) => ({
    id: t.id,
    label: t.label,
    r: [0.42, 0.66, 0.9, 1.0][i % 4],
    a: (i * 47) % 360,
    on: i < 4,
  }));

  const orreryOrbits = Math.min(4, Math.ceil(teams.length / 2));
  const orreryAdvancing = Math.min(4, Math.ceil(teams.length / 2));
  const isDraftLive = draftStatus === 'IN_PROGRESS';

  return (
    <div
      className="grid gap-[18px] p-[22px] items-start"
      style={{ gridTemplateColumns: '1.55fr 1fr' }}
    >
      {/* ── LEFT COLUMN ──────────────────────────────────────────── */}
      <div className="grid gap-[18px]">

        {/* HERO — tournament identity + phase serial + progress */}
        <Panel glow className="p-[22px]">
          <div
            className="grid gap-[26px] items-center"
            style={{ gridTemplateColumns: 'auto 1fr' }}
          >
            {/* Phase serial */}
            <div className="text-center min-w-[72px]">
              <Kicker className="mb-[6px]">赛程 · 阶段</Kicker>
              <div
                className="font-display font-bold tabular-nums leading-none text-nexus-accent"
                style={{ fontSize: 44 }}
              >
                {String(finishedCount).padStart(2, '0')}
              </div>
              <div
                className="font-serif italic text-nexus-dim mt-1"
                style={{ fontSize: 14 }}
              >
                of {String(matchCount).padStart(2, '0')}
              </div>
              <div className="font-mono text-[10px] text-nexus-faint mt-2 tracking-[0.08em]">
                PROGRESS · {finishedPct}%
              </div>
            </div>

            {/* Tournament name + status */}
            <div>
              <Kicker className="mb-2">当前赛事</Kicker>
              <div
                className="font-serif italic text-nexus-ink leading-[1.08] mb-1"
                style={{ fontSize: 28 }}
              >
                {tournamentName}
              </div>
              <div
                className="font-display font-bold uppercase leading-[0.92] text-nexus-accent"
                style={{ fontSize: 20 }}
              >
                {STATUS_LABEL[tournamentStatus] ?? tournamentStatus}
              </div>

              {/* Chips row */}
              <div className="flex flex-wrap gap-2 mt-[14px]">
                <Chip variant={statusChipVariant(tournamentStatus)}>
                  {tournamentKind}
                </Chip>
                <Chip>{matchCount} 场赛程</Chip>
                <Chip variant="good">
                  <LiveDot />
                  ORACLE LINK STABLE
                </Chip>
              </div>

              {/* Progress segmented bar */}
              <div className="mt-4">
                <div className="flex justify-between mb-[6px]">
                  <Kicker>赛程进度 · {finishedCount}/{matchCount}</Kicker>
                  <span className="font-mono text-[11px] text-nexus-accent tabular-nums">
                    {finishedPct}%
                  </span>
                </div>
                <SegBudget
                  used={finishedCount}
                  total={Math.max(matchCount, 1)}
                  segs={28}
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* KPI TILES — 4 data tiles */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(4,1fr)' }}
        >
          <DTile
            label="报名人数"
            value={registrationCount}
            sub={`队长意向 ${captainIntentionCount}`}
          />
          <DTile
            label="参赛队伍"
            value={teamCount}
            sub={standings.length > 0 ? `${standings.length} 组` : '—'}
          />
          <DTile
            label="赛程场次"
            value={matchCount}
            sub={`${finishedCount} 已结束`}
          />
          <DTile
            label="选秀状态"
            value={
              isDraftLive ? (
                <span className="text-nexus-hot">LIVE</span>
              ) : (
                <span className="text-nexus-dim" style={{ fontSize: 20 }}>
                  {DRAFT_STATUS_LABEL[draftStatus] ?? draftStatus}
                </span>
              )
            }
            sub={isDraftLive ? '选秀进行中' : '—'}
          >
            {isDraftLive && (
              <LiveDot className="absolute top-[14px] right-4" />
            )}
          </DTile>
        </div>

        {/* TRAJECTORY LINE — altitude profile */}
        {trajectoryPoints.length >= 2 && (
          <Panel>
            <PanelHead
              title="赛程轨迹 · ALTITUDE PROFILE"
              actions={
                <span className="font-mono text-[10px] text-nexus-faint">
                  {trajectoryPoints.length} 场
                </span>
              }
            />
            <div className="p-[18px]">
              <TrajectoryLine
                points={trajectoryPoints}
                current={trajectoryCurrentIndex}
                labels={trajectoryPoints.map(
                  (_, i) => 'D' + String(i + 1).padStart(2, '0'),
                )}
                w={900}
                h={96}
              />
            </div>
          </Panel>
        )}

        {/* STANDINGS — A/B group segmented bars */}
        {standings.length > 0 ? (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.min(standings.length, 2)},1fr)`,
            }}
          >
            {standings.slice(0, 2).map((group, i) => (
              <Panel key={group.groupId}>
                <PanelHead
                  title={`GRP-${i + 1} · ${group.name} · 积分`}
                />
                <div className="p-4">
                  <GroupBars
                    rows={group.rows}
                    color={
                      i % 2 === 0
                        ? 'rgb(var(--accent-n))'
                        : 'rgb(var(--accent-n2))'
                    }
                  />
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <Panel>
            <PanelHead title="积分榜" />
            <div className="px-4 py-4 text-nexus-faint font-mono text-[11px]">
              小组赛积分数据待更新
            </div>
          </Panel>
        )}
      </div>

      {/* ── RIGHT COLUMN ─────────────────────────────────────────── */}
      <div className="grid gap-[18px]">

        {/* ORRERY — 赛事星图 */}
        <Panel scan>
          <PanelHead
            title="ORRERY · 赛事星图 · 8 队"
            actions={<Chip variant="ac">观测中</Chip>}
          />
          <div className="p-[18px]">
            {teams.length > 0 ? (
              <>
                <Orrery
                  center="NEXUS"
                  bodies={orreryBodies}
                  size={300}
                  onBody={(teamId) =>
                    router.push(`/tournament/team/${encodeURIComponent(teamId)}`)
                  }
                />
                <div className="flex justify-around mt-2">
                  <div className="text-center">
                    <Kicker as="p">轨道</Kicker>
                    <div className="font-mono tabular-nums text-nexus-ink text-[20px]">
                      {orreryOrbits}
                    </div>
                  </div>
                  <div className="text-center">
                    <Kicker as="p">天体</Kicker>
                    <div className="font-mono tabular-nums text-nexus-ink text-[20px]">
                      {teams.length}
                    </div>
                  </div>
                  <div className="text-center">
                    <Kicker as="p">晋级</Kicker>
                    <div className="font-mono tabular-nums text-nexus-accent text-[20px]">
                      {orreryAdvancing}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-nexus-faint font-mono text-[11px]">
                队伍数据待更新
              </div>
            )}
          </div>
        </Panel>

        {/* LEADERBOARD — 选手榜 · KDA 前六 */}
        <Panel>
          <PanelHead title="LEAD-01 · 选手榜 · KDA 前六" />
          <div>
            {leaderboard.length > 0 ? (
              leaderboard.map((p, i) => (
                <div
                  key={p.playerId}
                  className="grid items-center gap-[11px] px-4 py-[10px] border-b border-nexus-line/40 last:border-b-0"
                  style={{ gridTemplateColumns: '26px 1fr auto' }}
                >
                  {/* Rank */}
                  <span
                    className="font-mono tabular-nums text-[13px] font-bold"
                    style={{
                      color:
                        i < 3 ? 'rgb(var(--accent-n))' : 'rgb(var(--faint))',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  {/* Nickname + team · position */}
                  <div className="min-w-0">
                    <div className="font-body text-[13.5px] text-nexus-ink truncate">
                      {p.nickname}
                    </div>
                    <div className="font-mono text-[10px] text-nexus-faint">
                      {[p.teamName, p.primaryPosition].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  {/* Sparkline + KDA */}
                  <div className="flex items-center gap-[10px]">
                    {p.recentForm.length >= 2 && (
                      <Sparkline
                        data={p.recentForm.map((w) => (w ? 1 : 0))}
                        w={56}
                        h={20}
                        color="rgb(var(--accent-n))"
                        dot
                      />
                    )}
                    <span className="font-mono tabular-nums text-[15px] font-bold text-nexus-accent">
                      {p.kda.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-nexus-faint font-mono text-[11px]">
                选手数据待更新
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
