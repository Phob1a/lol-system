/**
 * HoverCard — NEXUS hover-triggered floating mini-file system.
 *
 * Ported from docs/design/nexus/prototype/cards.jsx (HoverCard + Player/Team bodies).
 *
 * This is the NEXUS presentational-layer hover card (theme-driven, prototype
 * faithful, prop-driven). It is distinct from the legacy Prisma-wired
 * src/components/draft/PlayerHoverCard.tsx / TeamHoverCard.tsx.
 *
 * Behaviour (faithful to the prototype):
 *   - Clones its single child and injects hover handlers + a ref so it adds NO
 *     extra DOM (never disturbs grid/flex layouts).
 *   - The floating card is portaled to <body>.
 *   - 110ms open debounce on mouse-over.
 *   - Viewport-aware placement: opens to the right of the trigger, flips to the
 *     left when it would overflow, and vertically clamps into the viewport.
 *   - The card itself is pointer-events:none (it is a passive preview surface).
 *
 * Data is passed in via typed props — this component does NOT fetch or resolve
 * any real data. Callers supply already-shaped `PlayerCardData` / `TeamCardData`.
 */

'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import HexRadar, { type HexRadarAxis } from './charts/HexRadar';
import WinDonut from './charts/WinDonut';
import { FormDots } from './charts/FormDots';
import { PosPip, type Position } from './PosPip';
import { ChampAvatar } from './ChampAvatar';

// ── Position labels (mirrors data.js → POS_LABEL) ───────────────────────────────

const POS_LABEL: Record<Position, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MID: '中单',
  ADC: '射手',
  SUPPORT: '辅助',
};

// ── HoverCard wrapper ───────────────────────────────────────────────────────────

interface FloatPos {
  left: number;
  top: number;
}

export interface HoverCardProps {
  /** Single trigger element. Must accept a ref + mouse handlers. */
  children: ReactElement;
  /** Renders the floating card body. Called lazily when the card opens. */
  render: () => ReactNode;
  /** Card width in px (default 268). */
  w?: number;
  /** Estimated card height used for vertical clamping (default 300). */
  estH?: number;
}

/** Minimal shape of the props we inject onto the cloned child. */
interface InjectableChildProps {
  ref?: Ref<HTMLElement>;
  onMouseOver?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
}

export function HoverCard({ children, render, w = 268, estH = 300 }: HoverCardProps) {
  const [pos, setPos] = useState<FloatPos | null>(null);
  const ref = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = r.right + 12;
      if (left + w > vw - 12) left = r.left - w - 12; // flip to the left
      if (left < 12) left = Math.min(Math.max(12, r.left), vw - w - 12);

      let top = r.top + r.height / 2 - estH / 2;
      top = Math.max(12, Math.min(top, vh - estH - 12));

      setPos({ left, top });
    }, 110);
  }, [w, estH]);

  const leave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const child = Children.only(children);
  if (!isValidElement(child)) return child;

  const childProps = child.props as InjectableChildProps;
  // Preserve any ref already on the child (string refs are not supported).
  const childRef = (child as { ref?: Ref<HTMLElement> }).ref;

  const cloned = cloneElement(child as ReactElement<InjectableChildProps>, {
    ref: (n: HTMLElement | null) => {
      ref.current = n;
      if (typeof childRef === 'function') childRef(n);
      else if (childRef && typeof childRef === 'object') {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = n;
      }
    },
    onMouseOver: (e: React.MouseEvent) => {
      enter();
      childProps.onMouseOver?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      leave();
      childProps.onMouseLeave?.(e);
    },
  });

  return (
    <>
      {cloned}
      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: w,
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            <div
              className="nexus-panel nexus-panel-glow relative overflow-hidden border border-nexus-accent/50 bg-nexus-panel"
              style={{ borderRadius: 'var(--radius-nexus)' }}
            >
              {render()}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// ── Shared data shapes (caller-supplied) ────────────────────────────────────────

export interface PlayerCardChampion {
  championName: string;
  games: number;
}

/** Aggregate per-player summary stats used to derive the hex chart + readouts. */
export interface PlayerCardSummary {
  winRate: number; // 0..100
  kda: string;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDamage: number;
  avgGold: number;
  avgCs: number;
}

export interface PlayerCardData {
  nickname: string;
  primaryPosition: Position;
  teamName?: string;
  isCaptain?: boolean;
  /** Present when the player has match history → renders the rich body. */
  summary?: PlayerCardSummary;
  recentForm?: boolean[];
  commonChampions?: PlayerCardChampion[];
  /** Fallback fields when there is no summary (pool / unsigned player). */
  currentRank?: string;
  peakRank?: string;
  cost?: number;
}

export interface TeamCardSlot {
  position: Position;
  /** Registered player nickname, or undefined when the slot is empty. */
  nickname?: string;
}

export interface TeamCardData {
  name: string;
  group: string;
  slogan?: string;
  wins?: number;
  losses?: number;
  points?: number;
  budgetLeft?: number;
  slots: TeamCardSlot[];
}

// ── Hex derivation (mirrors cards.jsx → hexFrom) ────────────────────────────────

function hexFrom(s: PlayerCardSummary): HexRadarAxis[] {
  const cl = (x: number) => Math.max(0.05, Math.min(1, x));
  return [
    { label: '击杀', v: cl(s.avgKills / 8) },
    { label: '生存', v: cl(1 - s.avgDeaths / 8) },
    { label: '输出', v: cl(s.avgDamage / 36000) },
    { label: '经济', v: cl(s.avgGold / 16000) },
    { label: '补刀', v: cl(s.avgCs / 300) },
    { label: '团战', v: cl(s.avgAssists / 16) },
  ];
}

// ── Player mini-file body ───────────────────────────────────────────────────────

interface StatProps {
  label: string;
  val: ReactNode;
  accent?: boolean;
}

function Stat({ label, val, accent }: StatProps) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        className="font-mono uppercase tracking-[0.24em] text-nexus-faint"
        style={{ fontSize: 8.5, marginBottom: 3 }}
      >
        {label}
      </div>
      <div
        className="font-mono tabular-nums"
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: accent ? 'rgb(var(--accent-n))' : 'rgb(var(--ink))',
        }}
      >
        {val}
      </div>
    </div>
  );
}

export interface PlayerCardBodyProps {
  data: PlayerCardData;
}

export function PlayerCardBody({ data }: PlayerCardBodyProps) {
  const { primaryPosition: posKey, summary: s } = data;

  return (
    <div>
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '13px 14px 11px',
          borderBottom: '1px solid rgb(var(--line))',
        }}
      >
        <PosPip pos={posKey} on size={40} />
        <div style={{ minWidth: 0 }}>
          <div
            className="font-display"
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: 'rgb(var(--ink))',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {data.nickname}
          </div>
          <div
            className="font-mono tabular-nums"
            style={{ fontSize: 10, color: 'rgb(var(--faint))' }}
          >
            {data.teamName ?? '选手池'} · {POS_LABEL[posKey]}
          </div>
        </div>
        {data.isCaptain && (
          <span
            className="nexus-chip-ac inline-flex h-5 items-center rounded-[var(--radius-nexus)] border border-nexus-accent/60 px-[7px] font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-nexus-accent"
            style={{ marginLeft: 'auto' }}
          >
            队长
          </span>
        )}
      </div>

      {s ? (
        <div style={{ padding: '12px 14px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 10,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <HexRadar vals={hexFrom(s)} size={120} />
            <div style={{ display: 'grid', gap: 9, justifyItems: 'center' }}>
              <WinDonut pct={s.winRate} size={62} />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                  width: '100%',
                }}
              >
                <Stat label="KDA" val={s.kda} accent />
                <Stat label="输出" val={`${(s.avgDamage / 1000).toFixed(1)}K`} />
              </div>
            </div>
          </div>

          {data.recentForm && data.recentForm.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 9,
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.24em] text-nexus-faint"
                style={{ fontSize: 8.5 }}
              >
                近期战绩
              </span>
              <FormDots form={data.recentForm} size={12} />
            </div>
          )}

          {data.commonChampions && data.commonChampions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {data.commonChampions.slice(0, 3).map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-[var(--radius-nexus)] border border-nexus-line text-nexus-dim"
                  style={{
                    fontSize: 9.5,
                    gap: 5,
                    height: 20,
                    paddingLeft: 4,
                    paddingRight: 7,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <ChampAvatar champion={c.championName} size={15} />
                  {c.championName} · {c.games}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 14, display: 'grid', gap: 8 }}>
          <FallbackRow label="当前段位" val={data.currentRank ?? '—'} accent />
          <FallbackRow label="最高段位" val={data.peakRank ?? '—'} />
          <FallbackRow
            label="报名身价"
            val={data.cost != null ? `${data.cost} CR` : '—'}
            accent
          />
        </div>
      )}
    </div>
  );
}

interface FallbackRowProps {
  label: string;
  val: ReactNode;
  accent?: boolean;
}

function FallbackRow({ label, val, accent }: FallbackRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span
        className="font-mono uppercase tracking-[0.24em] text-nexus-faint"
        style={{ fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-mono tabular-nums"
        style={{ color: accent ? 'rgb(var(--accent-n))' : 'rgb(var(--ink))' }}
      >
        {val}
      </span>
    </div>
  );
}

// ── Team mini-file body ─────────────────────────────────────────────────────────

export interface TeamCardBodyProps {
  data: TeamCardData;
}

export function TeamCardBody({ data: t }: TeamCardBodyProps) {
  const record =
    t.wins != null && t.losses != null ? `${t.wins}–${t.losses}` : '—';

  return (
    <div>
      {/* header */}
      <div style={{ padding: '13px 14px 11px', borderBottom: '1px solid rgb(var(--line))' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div
            className="font-display"
            style={{ fontSize: 20, fontWeight: 700, color: 'rgb(var(--ink))' }}
          >
            {t.name}
          </div>
          <span className="inline-flex h-5 items-center rounded-[var(--radius-nexus)] border border-nexus-line px-[7px] font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-nexus-dim">
            {t.group} 组
          </span>
        </div>
        {t.slogan && (
          <div
            className="font-serif italic"
            style={{ fontSize: 12.5, color: 'rgb(var(--dim))', marginTop: 3 }}
          >
            “{t.slogan}”
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <TeamStat label="战绩" val={record} />
          <TeamStat label="积分" val={t.points ?? '—'} accent />
          <TeamStat label="预算余" val={t.budgetLeft ?? '—'} />
        </div>

        <div
          className="font-mono uppercase tracking-[0.24em] text-nexus-faint"
          style={{ fontSize: 8.5, marginBottom: 8 }}
        >
          首发阵容
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {t.slots.map((sl, i) => (
            <div key={i} style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
              <PosPip pos={sl.position} on={!!sl.nickname} size={26} />
              <div
                className="font-mono tabular-nums"
                style={{
                  fontSize: 8.5,
                  color: 'rgb(var(--dim))',
                  marginTop: 4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  padding: '0 1px',
                }}
              >
                {sl.nickname ? sl.nickname.slice(0, 4) : '空'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface TeamStatProps {
  label: string;
  val: ReactNode;
  accent?: boolean;
}

function TeamStat({ label, val, accent }: TeamStatProps) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        className="font-mono uppercase tracking-[0.24em] text-nexus-faint"
        style={{ fontSize: 8.5, marginBottom: 3 }}
      >
        {label}
      </div>
      <div
        className="font-mono tabular-nums"
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: accent ? 'rgb(var(--accent-n))' : 'rgb(var(--ink))',
        }}
      >
        {val}
      </div>
    </div>
  );
}

// ── Convenience wrappers ────────────────────────────────────────────────────────

export interface PlayerHoverCardProps {
  data: PlayerCardData;
  w?: number;
  children: ReactElement;
}

export function PlayerHoverCard({ data, w = 296, children }: PlayerHoverCardProps) {
  return (
    <HoverCard w={w} render={() => <PlayerCardBody data={data} />}>
      {children}
    </HoverCard>
  );
}

export interface TeamHoverCardProps {
  data: TeamCardData;
  w?: number;
  children: ReactElement;
}

export function TeamHoverCard({ data, w = 268, children }: TeamHoverCardProps) {
  return (
    <HoverCard w={w} render={() => <TeamCardBody data={data} />}>
      {children}
    </HoverCard>
  );
}

export default HoverCard;
