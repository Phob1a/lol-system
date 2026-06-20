'use client';

/**
 * PreTournamentOverview — shown when tournament is in SETUP/REGISTRATION/DRAFTING/GROUPING.
 * Uses nexus primitives for a tasteful "not started yet" overview panel.
 */

import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import DTile from '@/components/nexus/DTile';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import LiveDot from '@/components/nexus/LiveDot';
import { Orrery } from '@/components/nexus/charts/Orrery';

const STATUS_LABEL: Record<string, string> = {
  SETUP: 'SETUP · 筹备中',
  REGISTRATION: 'REGISTRATION · 报名开放',
  ROSTER_LOCKED: 'ROSTER LOCKED · 报名截止',
  DRAFTING: 'DRAFTING · 选秀中',
  GROUPING: 'GROUPING · 分组编排',
};

const STATUS_CHIP_VARIANT: Record<string, 'ac' | 'good' | 'hot' | 'default'> = {
  SETUP: 'default',
  REGISTRATION: 'good',
  ROSTER_LOCKED: 'ac',
  DRAFTING: 'hot',
  GROUPING: 'ac',
};

// Placeholder orrery bodies (decorative — no ids, no click handlers)
const PLACEHOLDER_BODIES = Array.from({ length: 8 }, (_, i) => ({
  label: '??',
  r: [0.42, 0.66, 0.9, 1.0][i % 4] as number,
  a: (i * 47) % 360,
  on: false,
}));

export type PreTournamentOverviewProps = {
  tournamentName: string;
  tournamentStatus: string;
  registrationCount: number;
  captainIntentionCount: number;
};

export function PreTournamentOverview({
  tournamentName,
  tournamentStatus,
  registrationCount,
  captainIntentionCount,
}: PreTournamentOverviewProps) {
  const isRegistrationOpen = tournamentStatus === 'REGISTRATION';
  const isDrafting = tournamentStatus === 'DRAFTING';

  return (
    <div
      className="grid gap-[18px] p-[22px] items-start"
      style={{ gridTemplateColumns: '1.55fr 1fr' }}
    >
      {/* ── LEFT COLUMN ──────────────────────────────────────────── */}
      <div className="grid gap-[18px]">
        {/* HERO */}
        <Panel glow className="p-[22px]">
          <div
            className="grid gap-[26px] items-center"
            style={{ gridTemplateColumns: 'auto 1fr' }}
          >
            {/* Phase indicator — pre-tournament shows 00 */}
            <div className="text-center min-w-[72px]">
              <Kicker className="mb-[6px]">赛程 · 阶段</Kicker>
              <div
                className="font-display font-bold tabular-nums leading-none text-nexus-faint"
                style={{ fontSize: 44 }}
              >
                00
              </div>
              <div
                className="font-serif italic text-nexus-faint mt-1"
                style={{ fontSize: 14 }}
              >
                待开始
              </div>
              <div className="font-mono text-[10px] text-nexus-faint mt-2 tracking-[0.08em]">
                AWAITING START
              </div>
            </div>

            {/* Tournament info */}
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

              <div className="flex flex-wrap gap-2 mt-[14px]">
                <Chip variant={STATUS_CHIP_VARIANT[tournamentStatus] ?? 'default'}>
                  {STATUS_LABEL[tournamentStatus] ?? tournamentStatus}
                </Chip>
                {isRegistrationOpen && (
                  <Chip variant="good">
                    <LiveDot />
                    报名开放中
                  </Chip>
                )}
                {isDrafting && (
                  <Chip variant="hot">
                    <LiveDot />
                    选秀进行中
                  </Chip>
                )}
              </div>

              <div className="mt-4 font-mono text-[11px] text-nexus-dim">
                赛程将在选秀完成后公布 · 敬请期待
              </div>
            </div>
          </div>
        </Panel>

        {/* KPI Tiles */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(4,1fr)' }}
        >
          <DTile
            label="报名人数"
            value={registrationCount}
            sub={`队长意向 ${captainIntentionCount}`}
          />
          <DTile label="参赛队伍" value="—" sub="选秀后确定" />
          <DTile label="赛程场次" value="—" sub="分组后公布" />
          <DTile
            label="选秀状态"
            value={
              isDrafting ? (
                <span className="text-nexus-hot">LIVE</span>
              ) : (
                <span className="text-nexus-dim" style={{ fontSize: 20 }}>
                  待开始
                </span>
              )
            }
            sub={isDrafting ? '选秀进行中' : '—'}
          >
            {isDrafting && (
              <LiveDot className="absolute top-[14px] right-4" />
            )}
          </DTile>
        </div>

        {/* Placeholder trajectory */}
        <Panel>
          <PanelHead title="赛程轨迹 · ALTITUDE PROFILE" />
          <div className="px-4 py-8 text-center">
            <div className="font-mono text-[11px] text-nexus-faint mb-1">
              AWAITING TOURNAMENT DATA
            </div>
            <div className="font-mono text-[11px] text-nexus-faint">
              赛程轨迹将在比赛开始后显示
            </div>
          </div>
        </Panel>

        {/* Placeholder standings */}
        <Panel>
          <PanelHead title="积分榜" />
          <div className="px-4 py-8 text-center">
            <div className="font-mono text-[11px] text-nexus-faint">
              积分榜将在小组赛开始后显示
            </div>
          </div>
        </Panel>
      </div>

      {/* ── RIGHT COLUMN ─────────────────────────────────────────── */}
      <div className="grid gap-[18px]">
        {/* Orrery — decorative placeholder */}
        <Panel scan>
          <PanelHead
            title="ORRERY · 赛事星图 · 8 队"
            actions={<Chip variant="default">待定</Chip>}
          />
          <div className="p-[18px]">
            <Orrery center="NEXUS" bodies={PLACEHOLDER_BODIES} size={300} />
            <div className="flex justify-around mt-2">
              {(['轨道', '天体', '晋级'] as const).map((label) => (
                <div key={label} className="text-center">
                  <Kicker as="p">{label}</Kicker>
                  <div className="font-mono tabular-nums text-nexus-faint text-[20px]">—</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Leaderboard placeholder */}
        <Panel>
          <PanelHead title="LEAD-01 · 选手榜 · KDA 前六" />
          <div className="px-4 py-8 text-center">
            <div className="font-mono text-[11px] text-nexus-faint">
              选手榜将在比赛开始后显示
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
