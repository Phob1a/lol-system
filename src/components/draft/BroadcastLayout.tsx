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
      {/*
        Desktop layout (lg+). CSS grid replaces the previous 20/60/20 flex,
        giving the side rails sensible min/max widths and the center column
        a flexible track. `min-h-0` on the wrapper and inner panels lets each
        column scroll independently inside a fixed-height parent (the
        consuming page is expected to bound the height — see live/admin
        draft/captain layout chains).
      */}
      <div className="hidden lg:grid lg:h-full lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(260px,320px)] bg-background">
        <div className="min-h-0 overflow-y-auto border-r">{pool}</div>

        <div className="flex min-w-0 min-h-0 flex-col gap-3 px-3">
          {controls && <div>{controls}</div>}
          <div>{hero}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">{grid}</div>
        </div>

        <div className="min-h-0 overflow-y-auto border-l">{events}</div>
      </div>

      {/* ── Mobile layout (below lg) ── */}
      <div className="flex flex-col gap-3 lg:hidden bg-background">
        {controls && <div>{controls}</div>}

        {/* Pinned hero */}
        <div className="sticky top-0 z-10 bg-background">{hero}</div>

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
