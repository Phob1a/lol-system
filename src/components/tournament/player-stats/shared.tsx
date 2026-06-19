'use client';

import { useState } from 'react';
import { championIconUrl } from '@/lib/tournament/champions';

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 0)}K`;
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function formatRawNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : Math.round(value).toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/** 由字符串稳定推导一个 HSL 色相，用作占位头像/战队色。 */
export function hueFromString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return hash;
}

export function ChampionIcon({
  championId,
  championName,
  size = 24,
}: {
  championId: string;
  championName: string | null;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  if (!championId || errored) {
    return (
      <span
        className="grid place-items-center rounded-md bg-slate-700 text-xs font-bold text-white"
        style={{ width: size, height: size }}
      >
        {(championName ?? championId).slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={championIconUrl(championId)}
      alt={championName ?? championId}
      width={size}
      height={size}
      className="rounded-sm object-cover"
      onError={() => setErrored(true)}
    />
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="mt-2 block text-xl font-semibold leading-none tabular-nums">{value}</span>
      {hint ? <span className="mt-2 block text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** 区块外壳：统一标题 + 右上副标题样式。 */
export function Section({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border bg-card p-4 ${className ?? ''}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>
      {children}
    </section>
  );
}
