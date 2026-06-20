/**
 * NEXUS Phase-1 demo gallery — TEMPORARY SCAFFOLDING.
 *
 * Renders a representative sample of every NEXUS presentational primitive and
 * chart (with small hardcoded sample props), plus a HoverCard example and the
 * Starfield, so the whole presentational layer is visually verifiable in both
 * themes via the ThemeSwitch.
 *
 * Route: /nexus-theme-demo
 * Remove (or fold into real screens) once Phase 1 is accepted.
 */
'use client';

import { useRef } from 'react';

import { ThemeSwitch } from '@/components/layout/ThemeSwitch';

// Primitives
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Tile from '@/components/nexus/Tile';
import DTile from '@/components/nexus/DTile';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import Readout from '@/components/nexus/Readout';
import NexusButton from '@/components/nexus/NexusButton';
import Field from '@/components/nexus/Field';
import LiveDot from '@/components/nexus/LiveDot';
import { PosPip } from '@/components/nexus/PosPip';
import { ChampAvatar } from '@/components/nexus/ChampAvatar';
import Starfield, { type StarfieldHandle } from '@/components/nexus/Starfield';

// Charts
import PlayerRadar from '@/components/nexus/charts/PlayerRadar';
import HexRadar from '@/components/nexus/charts/HexRadar';
import CompareRadar from '@/components/nexus/charts/CompareRadar';
import WinDonut from '@/components/nexus/charts/WinDonut';
import MetaDonut from '@/components/nexus/charts/MetaDonut';
import { Sparkline } from '@/components/nexus/charts/Sparkline';
import { SegBudget } from '@/components/nexus/charts/SegBudget';
import { TrajectoryLine } from '@/components/nexus/charts/TrajectoryLine';
import { GroupBars } from '@/components/nexus/charts/GroupBars';
import { ChampBars } from '@/components/nexus/charts/ChampBars';
import { FormDots } from '@/components/nexus/charts/FormDots';
import { KdaBars } from '@/components/nexus/charts/KdaBars';
import { ChampHeat } from '@/components/nexus/charts/ChampHeat';
import { SeasonTrend } from '@/components/nexus/charts/SeasonTrend';
import { Orrery } from '@/components/nexus/charts/Orrery';
import { MoonPhase } from '@/components/nexus/charts/MoonPhase';
import { BracketMap } from '@/components/nexus/charts/BracketMap';
import { Countdown } from '@/components/nexus/charts/Countdown';

// HoverCard
import {
  PlayerHoverCard,
  TeamHoverCard,
  type PlayerCardData,
  type TeamCardData,
} from '@/components/nexus/HoverCard';

// ── Sample data (synthetic, hardcoded) ──────────────────────────────────────────

const RADAR_AXES = [
  { label: 'KDA', v: 0.82 },
  { label: '输出', v: 0.66 },
  { label: '经济', v: 0.71 },
  { label: '补刀', v: 0.58 },
  { label: '团战', v: 0.9 },
  { label: '生存', v: 0.74 },
];

const HEX_AXES = [
  { label: '击杀', v: 0.7 },
  { label: '生存', v: 0.6 },
  { label: '输出', v: 0.85 },
  { label: '经济', v: 0.65 },
  { label: '补刀', v: 0.5 },
  { label: '团战', v: 0.8 },
];

const META_SLICES = [
  { label: '上路', v: 24 },
  { label: '打野', v: 18 },
  { label: '中路', v: 31 },
  { label: '射手', v: 27 },
  { label: '辅助', v: 14 },
];

const GROUP_ROWS = [
  { rank: 1, name: '苍穹之翼', points: 12, wins: 4, losses: 1 },
  { rank: 2, name: '深渊军团', points: 9, wins: 3, losses: 2 },
  { rank: 3, name: '极地远征', points: 6, wins: 2, losses: 3 },
  { rank: 4, name: '炽焰先锋', points: 3, wins: 1, losses: 4 },
];

const CHAMP_BARS = [
  { championName: '亚索', games: 14, winRate: 64, kda: '4.2' },
  { championName: '盲僧', games: 11, winRate: 55, kda: '3.6' },
  { championName: '锐雯', games: 8, winRate: 38, kda: '2.9' },
];

const CHAMP_HEAT = [
  { name: '亚索', games: 14, winRate: 64 },
  { name: '劫', games: 9, winRate: 48 },
  { name: '锐雯', games: 6, winRate: 33 },
];

const SEASON_GAMES = [
  true, true, false, true, false, false, true, true, true, false, true, true,
].map((win) => ({ win }));

const ORRERY_BODIES = [
  { id: 't1', label: 'A1', r: 0.42, a: 10, on: true },
  { id: 't2', label: 'A2', r: 0.66, a: 75 },
  { id: 't3', label: 'B1', r: 0.66, a: 160 },
  { id: 't4', label: 'B2', r: 0.9, a: 230 },
  { id: 't5', label: 'C1', r: 0.9, a: 300 },
];

const BRACKET: [
  { rows: { name: string; points: number }[] },
  { rows: { name: string; points: number }[] }
] = [
  {
    rows: [
      { name: '苍穹之翼', points: 12 },
      { name: '深渊军团', points: 9 },
      { name: '极地远征', points: 6 },
      { name: '炽焰先锋', points: 3 },
    ],
  },
  {
    rows: [
      { name: '星界守望', points: 11 },
      { name: '雷霆王座', points: 8 },
      { name: '幽影使团', points: 5 },
      { name: '黎明誓约', points: 2 },
    ],
  },
];

const PLAYER_CARD: PlayerCardData = {
  nickname: 'Faker',
  primaryPosition: 'MID',
  teamName: '苍穹之翼',
  isCaptain: true,
  summary: {
    winRate: 64,
    kda: '4.2',
    avgKills: 5.1,
    avgDeaths: 2.3,
    avgAssists: 7.8,
    avgDamage: 24500,
    avgGold: 12800,
    avgCs: 220,
  },
  recentForm: [true, true, false, true, true],
  commonChampions: [
    { championName: '亚索', games: 14 },
    { championName: '劫', games: 9 },
    { championName: '辛德拉', games: 6 },
  ],
};

const POOL_PLAYER_CARD: PlayerCardData = {
  nickname: 'Rookie',
  primaryPosition: 'TOP',
  currentRank: '钻石 II',
  peakRank: '大师 100LP',
  cost: 320,
};

const TEAM_CARD: TeamCardData = {
  name: '苍穹之翼',
  group: 'A',
  slogan: '直上九霄',
  wins: 4,
  losses: 1,
  points: 12,
  budgetLeft: 480,
  slots: [
    { position: 'TOP', nickname: 'Zeus' },
    { position: 'JUNGLE', nickname: 'Oner' },
    { position: 'MID', nickname: 'Faker' },
    { position: 'ADC', nickname: 'Gumayusi' },
    { position: 'SUPPORT' },
  ],
};

// ── Section wrapper ─────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="p-4">
      <PanelHead title={title} />
      <div className="mt-3">{children}</div>
    </Panel>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function NexusThemeDemoPage() {
  const starfieldRef = useRef<StarfieldHandle | null>(null);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: 'rgb(var(--bg))',
        color: 'rgb(var(--ink))',
        fontFamily: 'var(--font-body)',
        padding: 32,
      }}
    >
      {/* Background atmosphere */}
      <Starfield
        handleRef={starfieldRef}
        className="pointer-events-none fixed inset-0 -z-10"
      />

      {/* Header */}
      <header style={{ marginBottom: 28 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: '0.06em',
              color: 'rgb(var(--accent-n))',
            }}
          >
            ◢ NEXUS COMPONENT GALLERY
          </span>
          <ThemeSwitch />
        </div>
        <p
          style={{
            color: 'rgb(var(--dim))',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Phase-1 presentational layer · primitives + charts + hovercard +
          starfield · toggle the switch to verify both themes · /nexus-theme-demo
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* ── PRIMITIVES ── */}
        <Section title="Panels">
          <div style={{ display: 'grid', gap: 10 }}>
            <Panel className="p-3 text-sm text-nexus-dim">Plain panel</Panel>
            <Panel glow className="p-3 text-sm text-nexus-dim">
              Glow panel
            </Panel>
            <Panel scan className="p-3 text-sm text-nexus-dim">
              Scanline panel
            </Panel>
          </div>
        </Section>

        <Section title="Tiles">
          <div style={{ display: 'grid', gap: 10 }}>
            <Tile
              icon="◆"
              label="Active Players"
              value="1,204"
              sub="+12 this week"
            />
            <DTile label="Win Rate" value="64%" sub="Season 14" />
          </div>
        </Section>

        <Section title="Chips & LiveDot">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Chip>Default</Chip>
            <Chip variant="ac">Accent</Chip>
            <Chip variant="good">Good</Chip>
            <Chip variant="hot">
              <LiveDot /> Live
            </Chip>
          </div>
        </Section>

        <Section title="Kicker & Readout">
          <div style={{ display: 'grid', gap: 8 }}>
            <Kicker>Match Identifier</Kicker>
            <Readout className="text-2xl text-nexus-ink">1,204</Readout>
            <Readout serial className="text-2xl text-nexus-accent">
              00042
            </Readout>
          </div>
        </Section>

        <Section title="Buttons">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <NexusButton>Default</NexusButton>
            <NexusButton variant="primary">Primary</NexusButton>
            <NexusButton size="sm">Small</NexusButton>
          </div>
        </Section>

        <Section title="Fields">
          <div style={{ display: 'grid', gap: 10 }}>
            <Field label="Summoner Name" placeholder="Enter name…" />
            <Field label="Notes" multiline placeholder="Multi-line…" />
          </div>
        </Section>

        <Section title="PosPip">
          <div style={{ display: 'flex', gap: 8 }}>
            <PosPip pos="TOP" on />
            <PosPip pos="JUNGLE" on />
            <PosPip pos="MID" on />
            <PosPip pos="ADC" />
            <PosPip pos="SUPPORT" />
          </div>
        </Section>

        <Section title="ChampAvatar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ChampAvatar champion="亚索" size={48} />
            <ChampAvatar champion="盲僧" size={40} />
            <ChampAvatar champion="UnknownChamp" size={32} />
          </div>
        </Section>

        {/* ── CHARTS ── */}
        <Section title="PlayerRadar">
          <div style={{ maxWidth: 220, margin: '0 auto' }}>
            <PlayerRadar axes={RADAR_AXES} size={200} />
          </div>
        </Section>

        <Section title="HexRadar">
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <HexRadar vals={HEX_AXES} size={140} />
          </div>
        </Section>

        <Section title="CompareRadar">
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <CompareRadar
              labels={['击杀', '生存', '输出', '经济', '补刀', '团战']}
              a={[0.8, 0.6, 0.9, 0.7, 0.5, 0.85]}
              b={[0.6, 0.75, 0.5, 0.65, 0.7, 0.6]}
              size={200}
            />
          </div>
        </Section>

        <Section title="WinDonut">
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <WinDonut pct={64} />
            <WinDonut pct={42} size={72} color="rgb(var(--gold))" />
          </div>
        </Section>

        <Section title="MetaDonut">
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <MetaDonut data={META_SLICES} size={150} />
          </div>
        </Section>

        <Section title="Sparkline">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Sparkline
              data={[3, 5, 4, 7, 6, 9, 8, 11]}
              color="rgb(var(--accent-n))"
              dot
            />
            <Sparkline data={[10, 8, 9, 6, 7, 4, 5, 3]} />
          </div>
        </Section>

        <Section title="SegBudget">
          <SegBudget used={18} total={24} />
        </Section>

        <Section title="TrajectoryLine">
          <TrajectoryLine
            points={[2, 4, 3, 6, 5, 8, 7, 10]}
            current={5}
            labels={['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8']}
            w={420}
            h={90}
          />
        </Section>

        <Section title="GroupBars">
          <GroupBars rows={GROUP_ROWS} />
        </Section>

        <Section title="ChampBars">
          <ChampBars champs={CHAMP_BARS} />
        </Section>

        <Section title="FormDots">
          <FormDots form={[true, true, false, true, false, true, true]} />
        </Section>

        <Section title="KdaBars">
          <KdaBars k={51} d={23} a={78} />
        </Section>

        <Section title="ChampHeat">
          <ChampHeat rows={CHAMP_HEAT} />
        </Section>

        <Section title="SeasonTrend">
          <SeasonTrend games={SEASON_GAMES} w={320} h={70} />
        </Section>

        <Section title="MoonPhase">
          <MoonPhase total={7} current={3} size={20} />
        </Section>

        <Section title="Countdown">
          <Countdown to="2026-12-31T18:00:00Z" label="Finals" />
        </Section>

        <Section title="Orrery">
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <Orrery center="NEXUS" bodies={ORRERY_BODIES} size={300} />
          </div>
        </Section>

        <Section title="BracketMap">
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <BracketMap standings={BRACKET} w={460} h={240} />
          </div>
        </Section>

        {/* ── HOVERCARD ── */}
        <Section title="HoverCard (hover the triggers)">
          <div style={{ display: 'grid', gap: 12 }}>
            <PlayerHoverCard data={PLAYER_CARD}>
              <button
                type="button"
                className="w-full rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 px-3 py-2 text-left text-sm text-nexus-ink"
              >
                Player (rich) · Faker
              </button>
            </PlayerHoverCard>

            <PlayerHoverCard data={POOL_PLAYER_CARD}>
              <button
                type="button"
                className="w-full rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 px-3 py-2 text-left text-sm text-nexus-ink"
              >
                Player (pool / no summary) · Rookie
              </button>
            </PlayerHoverCard>

            <TeamHoverCard data={TEAM_CARD}>
              <button
                type="button"
                className="w-full rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 px-3 py-2 text-left text-sm text-nexus-ink"
              >
                Team · 苍穹之翼
              </button>
            </TeamHoverCard>
          </div>
        </Section>
      </div>
    </div>
  );
}
