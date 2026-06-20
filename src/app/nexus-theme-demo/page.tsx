/**
 * NEXUS Phase-0 demo page — TEMPORARY SCAFFOLDING.
 * Verifies that theme tokens and ThemeSwitch work end-to-end.
 * Route: /nexus-theme-demo
 * Remove once Phase 0 is accepted and the switch is integrated into real nav.
 */
'use client';

import { ThemeSwitch } from '@/components/layout/ThemeSwitch';

const SWATCHES: { label: string; cssVar: string }[] = [
  { label: 'bg', cssVar: 'rgb(var(--bg))' },
  { label: 'surface', cssVar: 'rgb(var(--surface))' },
  { label: 'panel', cssVar: 'rgb(var(--panel))' },
  { label: 'panel-2', cssVar: 'rgb(var(--panel-2))' },
  { label: 'line', cssVar: 'rgb(var(--line))' },
  { label: 'ink', cssVar: 'rgb(var(--ink))' },
  { label: 'dim', cssVar: 'rgb(var(--dim))' },
  { label: 'faint', cssVar: 'rgb(var(--faint))' },
  { label: 'accent', cssVar: 'rgb(var(--accent-n))' },
  { label: 'accent-2', cssVar: 'rgb(var(--accent-n2))' },
  { label: 'good', cssVar: 'rgb(var(--good))' },
  { label: 'bad', cssVar: 'rgb(var(--bad))' },
  { label: 'gold', cssVar: 'rgb(var(--gold))' },
  { label: 'hot', cssVar: 'rgb(var(--hot))' },
];

export default function NexusThemeDemoPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'rgb(var(--bg))',
        color: 'rgb(var(--ink))',
        fontFamily: 'var(--font-body)',
        padding: 32,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16 }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: '0.06em',
              color: 'rgb(var(--accent-n))',
            }}
          >
            ◢ NEXUS THEME DEMO
          </span>
          <ThemeSwitch />
        </div>
        <p style={{ color: 'rgb(var(--dim))', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
          Phase-0 scaffolding · Toggle the switch to verify retint · /nexus-theme-demo
        </p>
      </div>

      {/* Color swatches */}
      <section style={{ marginBottom: 32 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            letterSpacing: '0.1em',
            color: 'rgb(var(--faint))',
            marginBottom: 12,
          }}
        >
          PALETTE · DESIGN TOKENS
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SWATCHES.map(({ label, cssVar }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  background: cssVar,
                  border: '1px solid rgb(var(--line))',
                  borderRadius: 2,
                }}
              />
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgb(var(--dim))' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Typography specimen */}
      <section style={{ marginBottom: 32 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            letterSpacing: '0.1em',
            color: 'rgb(var(--faint))',
            marginBottom: 12,
          }}
        >
          TYPOGRAPHY · FONT STACKS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'rgb(var(--ink))' }}>
            Display · Saira Condensed — 指挥舱
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontStyle: 'italic', color: 'rgb(var(--ink))' }}>
            Serif · Newsreader (celestial) — 观测台
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgb(var(--dim))' }}>
            Body · Saira — The quick brown fox jumps over the lazy dog.
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgb(var(--accent-n))' }}>
            Mono · JetBrains Mono / Space Mono — 0x1F4C0 · ORACLE LINK STABLE
          </div>
        </div>
      </section>

      {/* Surface panel specimen */}
      <section>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            letterSpacing: '0.1em',
            color: 'rgb(var(--faint))',
            marginBottom: 12,
          }}
        >
          SURFACES · PANEL TOKENS
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { t: 'surface', bg: 'rgb(var(--surface))' },
            { t: 'panel', bg: 'rgb(var(--panel))' },
            { t: 'panel-2', bg: 'rgb(var(--panel-2))' },
          ].map(({ t, bg }) => (
            <div
              key={t}
              style={{
                background: bg,
                border: '1px solid rgb(var(--line))',
                borderRadius: 'var(--radius-nexus)',
                padding: '12px 16px',
                minWidth: 120,
              }}
            >
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgb(var(--faint))', marginBottom: 4 }}>
                --{t}
              </div>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-body)', color: 'rgb(var(--ink))' }}>
                Sample text
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
