'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type MobileTab = 'pool' | 'grid' | 'events';

type Props = {
  pool: ReactNode;
  hero: ReactNode;
  grid: ReactNode;
  events: ReactNode;
  controls?: ReactNode;
  defaultMobileTab?: MobileTab;
};

const TAB_LABELS: Record<MobileTab, string> = {
  pool: '选手池',
  grid: '队伍',
  events: '事件流',
};

const TABS: MobileTab[] = ['pool', 'grid', 'events'];

export function BroadcastLayout({
  pool,
  hero,
  grid,
  events,
  controls,
  defaultMobileTab = 'pool',
}: Props) {
  const [mobileTab, setMobileTab] = useState<MobileTab>(defaultMobileTab);

  return (
    <>
      {/*
        Desktop layout (lg+):
        Left rail  — pool (fixed 300px)
        Centre     — controls? + hero + team grid (flexible)
        Right rail — event stream (fixed 300px)
      */}
      <div className="hidden lg:grid lg:h-full lg:min-h-0 lg:flex-1 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
        {/* Left — pool */}
        <div className="min-h-0 overflow-y-auto border-r border-nexus-line bg-nexus-panel">
          {pool}
        </div>

        {/* Centre — hero + grid */}
        <div className="flex min-w-0 min-h-0 flex-col gap-3 px-3 py-3">
          {controls && <div>{controls}</div>}
          <div>{hero}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">{grid}</div>
        </div>

        {/* Right — event stream */}
        <div className="min-h-0 overflow-y-auto border-l border-nexus-line bg-nexus-panel">
          {events}
        </div>
      </div>

      {/* ── Mobile layout (below lg) ── */}
      <div className="flex flex-col gap-3 lg:hidden bg-nexus-bg">
        {controls && <div>{controls}</div>}

        {/* Pinned hero */}
        <div className="sticky top-0 z-10 bg-nexus-surface">{hero}</div>

        {/* Nexus-styled tab bar */}
        <div role="tablist" className="flex border-b border-nexus-line bg-nexus-surface">
          {TABS.map((tab) => {
            const active = mobileTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                data-state={active ? 'active' : 'inactive'}
                onClick={() => setMobileTab(tab)}
                className={cn(
                  'flex-1 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors',
                  active
                    ? 'text-nexus-accent border-b-2 border-nexus-accent'
                    : 'text-nexus-dim border-b-2 border-transparent hover:text-nexus-ink',
                )}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" className="min-h-0">
          {mobileTab === 'pool' && pool}
          {mobileTab === 'grid' && grid}
          {mobileTab === 'events' && events}
        </div>
      </div>
    </>
  );
}
