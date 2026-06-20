'use client';

/**
 * NEXUS Starfield — particle starfield + constellation backdrop.
 * Full-bleed fixed canvas rendered behind app content. Reads --accent-n /
 * --accent-n2 CSS custom properties (RGB triplets) so it re-tints whenever
 * the data-style attribute on <html> changes. Layers:
 *   • parallax star dust (three depth planes)
 *   • drifting nodes that link into faint constellations near the cursor
 *   • occasional comets
 *
 * Respects prefers-reduced-motion: if reduced, renders a single static frame
 * (no animation loop). Cleans up rAF + MutationObserver on unmount.
 *
 * Ported from docs/design/nexus/prototype/starfield.js (HTML/Babel reference).
 */

import { useEffect, useRef } from 'react';

// ─── Internal types ────────────────────────────────────────────────────────────

interface DustParticle {
  x: number;
  y: number;
  z: 0 | 1 | 2; // 0 = far, 2 = near
  r: number;
  sp: number;
  tw: number;
  tws: number;
}

interface ConstellationNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  bright: boolean;
}

interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 → 0
  len: number;
}

type RGB = [number, number, number];

// ─── Public API (exposed via ref) ─────────────────────────────────────────────

export interface StarfieldHandle {
  /** Re-read CSS custom properties and re-tint the canvas. */
  refreshColors: () => void;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface StarfieldProps {
  /** Forwarded ref so a theme-switch parent can call refreshColors(). */
  handleRef?: React.RefObject<StarfieldHandle | null>;
  /** Extra class names applied to the <canvas> element. */
  className?: string;
}

// ─── Helper: read a CSS custom property as an RGB triplet ─────────────────────

function readRgbVar(name: string, fallback: RGB): RGB {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!raw) return fallback;
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length >= 3 && parts.every((n) => !isNaN(n))) {
    return [parts[0], parts[1], parts[2]];
  }
  return fallback;
}

// ─── Core engine (runs inside the useEffect closure) ──────────────────────────
// Extracted as a pure function so TypeScript can see that `canvas` and `ctx`
// are non-null — the early-return guard in useEffect doesn't narrow them across
// nested function declarations with strict mode.

function runEngine(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  onHandleReady: (handle: StarfieldHandle) => void,
  onHandleExpired: () => void
): () => void {
  // ── Reduced motion ──────────────────────────────────────────────────────────
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── State ───────────────────────────────────────────────────────────────────
  let W = 0;
  let H = 0;
  let DPR = Math.min(2, window.devicePixelRatio || 1);

  // Fallbacks mirror the prototype's defaults (celestial palette).
  let accent: RGB = [232, 116, 42];
  let accent2: RGB = [255, 158, 74];

  let dust: DustParticle[] = [];
  let nodes: ConstellationNode[] = [];
  let comets: Comet[] = [];
  const mouse = { x: -9999, y: -9999 };

  let rafId: number | undefined;
  let cometTimer = 0;

  // ── Color refresh ───────────────────────────────────────────────────────────
  // Reads --accent-n / --accent-n2 (named with -n suffix to avoid shadcn
  // collision with the shadcn --accent token).
  function doRefreshColors(): void {
    accent = readRgbVar('--accent-n', [232, 116, 42]);
    accent2 = readRgbVar('--accent-n2', [255, 158, 74]);
  }

  // Expose the handle so the parent can call refreshColors() imperatively.
  onHandleReady({ refreshColors: doRefreshColors });

  // ── Build particles ─────────────────────────────────────────────────────────
  function build(): void {
    const area = W * H;

    const dustCount = Math.min(420, Math.round(area / 5200));
    dust = [];
    for (let i = 0; i < dustCount; i++) {
      const layer = (i % 3) as 0 | 1 | 2;
      dust.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: layer,
        r: (layer + 1) * 0.35 + Math.random() * 0.5,
        sp: (layer + 1) * 0.04 + Math.random() * 0.05,
        tw: Math.random() * Math.PI * 2,
        tws: 0.6 + Math.random() * 1.6,
      });
    }

    const nodeCount = Math.min(70, Math.round(area / 26000));
    nodes = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: 0.8 + Math.random() * 1.4,
        bright: Math.random() > 0.7,
      });
    }
  }

  // ── Resize ──────────────────────────────────────────────────────────────────
  function resize(): void {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  // ── Comet spawner ───────────────────────────────────────────────────────────
  function spawnComet(): void {
    const fromLeft = Math.random() > 0.5;
    comets.push({
      x: fromLeft ? -40 : W + 40,
      y: Math.random() * H * 0.6,
      vx: (fromLeft ? 1 : -1) * (3.5 + Math.random() * 2.5),
      vy: 1.4 + Math.random() * 1.2,
      life: 1,
      len: 80 + Math.random() * 90,
    });
  }

  // ── Frame renderer ──────────────────────────────────────────────────────────
  function frame(): void {
    ctx.clearRect(0, 0, W, H);

    // — Parallax dust ----------------------------------------------------------
    for (const d of dust) {
      d.y += d.sp;
      if (d.y > H + 2) {
        d.y = -2;
        d.x = Math.random() * W;
      }
      d.tw += 0.016 * d.tws;

      const baseAlpha = d.z === 2 ? 0.55 : d.z === 1 ? 0.4 : 0.28;
      const a = baseAlpha * (0.55 + 0.45 * Math.sin(d.tw));

      // Far layer (z=0) uses a neutral white-blue — intentionally not theme-coloured.
      const col: RGB =
        d.z === 2 ? accent2 : d.z === 1 ? accent : [200, 210, 225];

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
      ctx.fill();
    }

    // — Constellation nodes + links --------------------------------------------
    // Advance positions.
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;

      // Gentle attraction toward mouse cursor.
      const dxm = mouse.x - n.x;
      const dym = mouse.y - n.y;
      const dm = Math.hypot(dxm, dym);
      if (dm < 160) {
        n.x += dxm * 0.0012 * (1 - dm / 160);
        n.y += dym * 0.0012 * (1 - dm / 160);
      }
    }

    // Draw links, then dots.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 118) {
          const o = (1 - dist / 118) * 0.5;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const mid =
            mouse.x > -999
              ? Math.hypot(midX - mouse.x, midY - mouse.y)
              : 9999;
          const near = mid < 180 ? 1.9 : 1;

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${(o * near).toFixed(3)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }

      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      if (a.bright) {
        ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},0.95)`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${accent[0]},${accent[1]},${accent[2]},0.9)`;
      } else {
        ctx.fillStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},0.7)`;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // — Comets (decorative motion — not rendered in reduced-motion mode) -------
    if (!reduce) {
      cometTimer += 0.016;
      if (cometTimer > 4.2 && comets.length < 2) {
        if (Math.random() > 0.5) spawnComet();
        cometTimer = 0;
      }
      comets = comets.filter((c) => c.life > 0);
      for (const c of comets) {
        c.x += c.vx;
        c.y += c.vy;
        c.life -= 0.006;

        const speed = Math.hypot(c.vx, c.vy);
        const tx = c.x - (c.vx / speed) * c.len;
        const ty = c.y - (c.vy / speed) * c.len;

        const grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
        grad.addColorStop(
          0,
          `rgba(${accent2[0]},${accent2[1]},${accent2[2]},${(0.9 * c.life).toFixed(3)})`
        );
        grad.addColorStop(
          1,
          `rgba(${accent2[0]},${accent2[1]},${accent2[2]},0)`
        );

        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Comet head glow.
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.9 * c.life).toFixed(3)})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},1)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Schedule next frame only when motion is allowed.
    if (!reduce) {
      rafId = requestAnimationFrame(frame);
    }
  }

  // ── Event listeners ─────────────────────────────────────────────────────────
  function onResize(): void {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    resize();
  }

  function onMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function onMouseLeave(): void {
    mouse.x = -9999;
    mouse.y = -9999;
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseleave', onMouseLeave);

  // ── MutationObserver: auto-retint on data-style change ──────────────────────
  // Watches document.documentElement for mutations to the data-style attribute.
  // When the theme flips ("command" ↔ "celestial"), doRefreshColors() re-reads
  // --accent-n / --accent-n2 so the next painted frame uses the new palette.
  // In reduced-motion mode a fresh static frame is rendered immediately.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'data-style') {
        doRefreshColors();
        if (reduce) {
          frame();
        }
        break;
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-style'],
  });

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  doRefreshColors();
  resize();

  if (reduce) {
    frame(); // single static frame — no loop
  } else {
    rafId = requestAnimationFrame(frame);
  }

  // ── Cleanup (returned to useEffect) ─────────────────────────────────────────
  return () => {
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    observer.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseleave', onMouseLeave);
    onHandleExpired();
  };
}

// ─── Starfield component ───────────────────────────────────────────────────────

export default function Starfield({ handleRef, className }: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    return runEngine(
      canvas,
      ctx,
      (handle) => {
        if (handleRef) {
          (
            handleRef as React.MutableRefObject<StarfieldHandle>
          ).current = handle;
        }
      },
      () => {
        if (handleRef) {
          (
            handleRef as React.MutableRefObject<StarfieldHandle | null>
          ).current = null;
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount; all mutable state lives inside runEngine

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // Full-bleed fixed layer; z-index 0 sits behind all content.
      // pointer-events: none ensures it never intercepts clicks or focus.
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
      }}
      className={className}
    />
  );
}
