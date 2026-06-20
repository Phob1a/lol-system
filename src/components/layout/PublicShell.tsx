'use client';

/**
 * PublicShell — NEXUS public-side app shell.
 *
 * Renders:
 *   • A fixed Starfield canvas behind all content
 *   • A sticky top statbar with tournament info, a clock, and ThemeSwitch
 *   • A left nav rail (232 px) with links to public routes; collapses to a
 *     horizontal scroll bar on narrow (<= 760 px) viewports
 *   • A main content area where page children render
 *
 * Accepts optional tournament props so server layouts can pass live data.
 * Works gracefully when no tournament is active (pre-launch / SETUP states).
 *
 * Ported from docs/design/nexus/prototype/app.jsx (statbar + nav rail) and
 * docs/design/nexus/prototype/nexus.css (.statbar, nav rail rules).
 */

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Starfield from '@/components/nexus/Starfield';
import { ThemeSwitch } from '@/components/layout/ThemeSwitch';
import LiveDot from '@/components/nexus/LiveDot';
import Kicker from '@/components/nexus/Kicker';

// ─── Nav items (prototype NAV array, mapped to real routes) ────────────────────

const NAV_ITEMS = [
  { href: '/',           glyph: '◎', label: '观测总览', sub: 'OBSERVATORY'  },
  { href: '/tournament', glyph: '⊞', label: '赛事中心', sub: 'MATCHES'      },
  { href: '/live',       glyph: '◇', label: '选秀直播', sub: 'DRAFT · LIVE' },
  { href: '/register',   glyph: '+', label: '报名注册', sub: 'ENLIST'       },
] as const;

// ─── Human-readable status map ────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  SETUP:         'SETUP',
  REGISTRATION:  'REGISTRATION',
  ROSTER_LOCKED: 'LOCKED',
  DRAFT:         'DRAFT',
  GROUP_STAGE:   'GROUP STAGE',
  KNOCKOUT:      'KNOCKOUT',
  FINISHED:      'FINISHED',
  ARCHIVED:      'ARCHIVED',
};

/** Statuses that count as "live" (pulsing dot, HOT colour). */
const LIVE_STATUSES = new Set(['DRAFT', 'GROUP_STAGE', 'KNOCKOUT']);

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface PublicShellTournament {
  name: string;
  status: string;
}

export interface PublicShellProps {
  children: React.ReactNode;
  /** Active tournament — omit or null when none exists. */
  tournament?: PublicShellTournament | null;
}

// ─── Internal: live clock ──────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    function tick() {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      setTime(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className="font-mono tabular-nums"
      style={{ fontSize: 13, letterSpacing: 1, color: 'rgb(var(--accent-n))' }}
      aria-live="off"
      aria-atomic="true"
    >
      {time || '··:··:··'}
    </span>
  );
}

// ─── Shell ─────────────────────────────────────────────────────────────────────

export default function PublicShell({ children, tournament }: PublicShellProps) {
  const pathname = usePathname();

  // Track narrow viewport for responsive layout switch
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    setNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const tournamentName   = tournament?.name ?? 'NEXUS';
  const tournamentStatus = tournament
    ? (STATUS_LABELS[tournament.status] ?? tournament.status)
    : null;
  const isLive = tournament ? LIVE_STATUSES.has(tournament.status) : false;

  // ── Nav link renderer (shared between wide + narrow layouts) ─────────────────

  function NavItem({ href, glyph, label, sub }: (typeof NAV_ITEMS)[number]) {
    const active =
      href === '/' ? pathname === '/' : pathname.startsWith(href);
    const isLiveRoute = href === '/live';

    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        // Base styles replicate .navitem from nexus.css (prototype)
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: 11,
          width: '100%',
          padding: '11px 13px',
          textDecoration: 'none',
          borderBottom: '1px solid rgb(var(--line) / 0.4)',
          transition: 'all .15s',
          background: active ? 'rgb(var(--accent-n) / 0.1)' : 'transparent',
          color:      active ? 'rgb(var(--accent-n))' : 'rgb(var(--dim))',
          boxShadow:  active ? 'inset 2px 0 0 rgb(var(--accent-n))' : 'none',
        }}
      >
        {/* Glyph badge — hexagon on command, circle on celestial (via CSS) */}
        <span
          className="nexus-nav-glyph"
          style={{
            width: 30,
            height: 30,
            display: 'grid',
            placeItems: 'center',
            border: '1px solid currentColor',
            opacity: 0.9,
            flexShrink: 0,
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 14,
          }}
        >
          {glyph}
        </span>

        {/* Label + sub */}
        <span>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: 1,
              color: 'rgb(var(--faint))',
            }}
          >
            {sub}
          </span>
        </span>

        {/* Live dot on the draft/live route */}
        {isLiveRoute && <LiveDot />}
      </Link>
    );
  }

  // ── Statbar (shared) ──────────────────────────────────────────────────────────

  const Statbar = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        height: 54,
        padding: '0 22px',
        borderBottom: '1px solid rgb(var(--line))',
        background: 'rgb(var(--surface) / 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Wordmark */}
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '0.06em',
          color: 'rgb(var(--accent-n))',
          textShadow: '0 0 16px rgb(var(--accent-n) / 0.6)',
          whiteSpace: 'nowrap',
        }}
      >
        ◢ NEXUS
      </span>

      {/* Center: link status + tournament */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 18,
        }}
        // nexus.css hides this on narrow via .statbar-center; we use inline
        // responsive logic instead (narrow state already handled above)
      >
        <span
          className="font-mono"
          style={{
            fontSize: 11,
            color: isLive ? 'rgb(var(--dim))' : 'rgb(var(--faint))',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          {isLive && <LiveDot />}
          {isLive ? 'ORACLE LINK STABLE' : '· ORACLE LINK ·'}
        </span>

        {tournamentStatus && (
          <span
            className="font-mono"
            style={{ fontSize: 11, color: 'rgb(var(--faint))' }}
          >
            · {tournamentStatus} ·
          </span>
        )}

        <span
          className="font-mono"
          style={{ fontSize: 11, color: 'rgb(var(--dim))' }}
        >
          {tournamentName}
        </span>
      </div>

      {/* Right: clock + theme switch */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}
      >
        <Clock />
        <ThemeSwitch />
      </div>
    </div>
  );

  // ── Narrow layout (top bar + horizontal scroll nav) ───────────────────────────

  if (narrow) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Starfield />
        {Statbar}

        {/* Horizontal scrolling nav */}
        <nav
          aria-label="Public navigation"
          style={{
            display: 'flex',
            overflowX: 'auto',
            borderBottom: '1px solid rgb(var(--line))',
            background: 'rgb(var(--surface) / 0.9)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            position: 'sticky',
            top: 54,
            zIndex: 19,
            scrollbarWidth: 'none',
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            const isLiveRoute = item.href === '/live';
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '8px 14px',
                  textDecoration: 'none',
                  borderBottom: active
                    ? '2px solid rgb(var(--accent-n))'
                    : '2px solid transparent',
                  color: active ? 'rgb(var(--accent-n))' : 'rgb(var(--dim))',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all .15s',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 14,
                  }}
                >
                  {item.glyph}
                </span>
                <span
                  style={{ fontFamily: 'var(--font-body)', fontSize: 11 }}
                >
                  {item.label}
                </span>
                {isLiveRoute && (
                  <LiveDot
                    style={{ position: 'absolute', top: 6, right: 8 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <main style={{ flex: 1, position: 'relative', zIndex: 2 }}>
          {children}
        </main>
      </div>
    );
  }

  // ── Wide layout (left nav rail) ───────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Fixed starfield behind everything */}
      <Starfield />

      {Statbar}

      {/* Body: 232px rail + fluid main */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '232px 1fr',
          alignItems: 'start',
        }}
      >
        {/* ── Nav rail ── */}
        <nav
          aria-label="Public navigation"
          style={{
            borderRight: '1px solid rgb(var(--line))',
            background: 'rgb(var(--surface) / 0.5)',
            position: 'sticky',
            top: 54,
            alignSelf: 'start',
            minHeight: 'calc(100vh - 54px)',
          }}
        >
          {/* Rail header */}
          <div style={{ padding: '16px 14px 12px' }}>
            <Kicker>PANEL · NAV</Kicker>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 18,
                color: 'rgb(var(--ink))',
                marginTop: 4,
                lineHeight: 0.92,
                textTransform: 'uppercase',
              }}
            >
              控制面板
            </div>
          </div>

          {/* Nav links */}
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}

          {/* Glow divider rule */}
          <div style={{ padding: '16px 16px 0' }}>
            <div
              style={{
                height: 1,
                border: 0,
                background:
                  'linear-gradient(90deg, transparent, rgb(var(--accent-n) / 0.6), transparent)',
              }}
            />
          </div>

          {/* Tournament status card */}
          {tournament && (
            <div style={{ padding: '12px 14px 20px' }}>
              <div
                className="nexus-panel"
                style={{
                  padding: 12,
                  background: 'rgb(var(--panel))',
                  border: '1px solid rgb(var(--line))',
                }}
              >
                <Kicker style={{ marginBottom: 6, display: 'block' }}>
                  TOURNAMENT
                </Kicker>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    color: 'rgb(var(--ink))',
                    fontWeight: 500,
                    marginBottom: 4,
                  }}
                >
                  {tournament.name}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {isLive && <LiveDot />}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      color: isLive
                        ? 'rgb(var(--hot))'
                        : 'rgb(var(--faint))',
                    }}
                  >
                    {tournamentStatus}
                  </span>
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* ── Main content ── */}
        <main style={{ minWidth: 0, position: 'relative', zIndex: 2 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
