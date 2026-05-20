'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type Props = {
  pool: ReactNode;
  hero: ReactNode;
  grid: ReactNode;
  events: ReactNode;
  controls?: ReactNode;
};

export function BroadcastLayout({ pool, hero, grid, events, controls }: Props) {
  return (
    <>
      {/* ── Desktop layout (lg and up) ── */}
      <div className="hidden lg:flex lg:flex-row lg:gap-3 lg:h-full">
        {/* Left column — player pool */}
        <div className="lg:w-1/5 shrink-0 overflow-y-auto">{pool}</div>

        {/* Center column — controls + hero + grid */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {controls && <div>{controls}</div>}
          <div>{hero}</div>
          <div className="flex-1 overflow-y-auto">{grid}</div>
        </div>

        {/* Right column — event stream */}
        <div className="lg:w-1/5 shrink-0 overflow-y-auto">{events}</div>
      </div>

      {/* ── Mobile layout (below lg) ── */}
      <div className="flex flex-col gap-3 lg:hidden">
        {controls && <div>{controls}</div>}

        {/* Pinned hero */}
        <div className="sticky top-0 z-10">{hero}</div>

        {/* Tabs for pool / grid / events */}
        <Tabs defaultValue="pool">
          <TabsList className="w-full">
            <TabsTrigger value="pool" className="flex-1">
              选手
            </TabsTrigger>
            <TabsTrigger value="grid" className="flex-1">
              队伍
            </TabsTrigger>
            <TabsTrigger value="events" className="flex-1">
              事件
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pool">{pool}</TabsContent>
          <TabsContent value="grid">{grid}</TabsContent>
          <TabsContent value="events">{events}</TabsContent>
        </Tabs>
      </div>
    </>
  );
}
