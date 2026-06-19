'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DamageComposition, PlayerGameRow } from '@/lib/tournament/player-stats-service';
import { ChampionIcon, formatNumber, formatRawNumber, Section, StatCard } from './shared';

function DamageCompositionBar({ composition }: { composition: DamageComposition }) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">伤害构成（本局）</p>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <span className="bg-blue-600" style={{ width: `${composition.physicalPct}%` }} />
        <span className="bg-violet-600" style={{ width: `${composition.magicPct}%` }} />
        <span className="bg-amber-600" style={{ width: `${composition.truePct}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />物理 {composition.physicalPct}%</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-600" />魔法 {composition.magicPct}%</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-600" />真实 {composition.truePct}%</span>
      </div>
    </div>
  );
}

function RawStatsBlock({ rawStats }: { rawStats: Record<string, unknown> | null | undefined }) {
  if (!rawStats) return null;
  const sorted = Object.fromEntries(Object.entries(rawStats).sort(([a], [b]) => a.localeCompare(b)));
  return (
    <details className="rounded-md border bg-background">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">原始 extStats 字段（?debug=1）</summary>
      <pre className="max-h-72 overflow-auto border-t bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
        {JSON.stringify(sorted, null, 2)}
      </pre>
    </details>
  );
}

export function PlayerMatchLog({ games }: { games: PlayerGameRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(games[0]?.gameId ?? null);

  return (
    <Section title="逐场战绩" subtitle="点开看单局详情">
      {games.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无对局记录</p>
      ) : (
        <div className="grid gap-2">
          {games.map((row) => {
            const open = expanded === row.gameId;
            const ext = row.extended;
            return (
              <article key={row.gameId} className="overflow-hidden rounded-lg border bg-card">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : row.gameId)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 text-left transition hover:bg-muted/40"
                  aria-expanded={open}
                >
                  <Badge
                    variant={row.win ? 'default' : 'secondary'}
                    className={cn(row.win ? 'bg-emerald-600' : 'bg-rose-500 text-white')}
                  >
                    {row.win ? '胜' : '负'}
                  </Badge>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 truncate font-semibold">
                      <ChampionIcon championId={row.championId} championName={row.championName} size={18} />
                      {row.championName ?? row.championId}
                      {row.isMvp ? (
                        <span className="rounded-sm bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-700">MVP</span>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {row.matchLabel} · vs {row.opponent} · {row.kills}/{row.deaths}/{row.assists} · 伤害 {formatNumber(row.damage)}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-primary">{open ? '收起' : '展开'}</span>
                </button>
                {open ? (
                  <div className="grid gap-3 border-t bg-muted/10 p-3">
                    <div className="flex justify-end">
                      <Link
                        href={`/tournament/match/${row.matchId}`}
                        aria-label={`查看对局 ${row.matchLabel}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        查看对局详情 →
                      </Link>
                    </div>
                    {!ext ? (
                      <p className="text-sm text-muted-foreground">无扩展数据</p>
                    ) : (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <StatCard label="英雄等级" value={ext.championLevel ?? '—'} />
                          <StatCard label="目标伤害" value={formatNumber(ext.objectiveDamage)} />
                          <StatCard label="视野分" value={formatRawNumber(ext.visionScore)} />
                          <StatCard label="承伤 / 减免" value={`${formatNumber(ext.damageTaken)} / ${formatNumber(ext.damageMitigated)}`} />
                          <StatCard label="插眼 / 排眼" value={`${formatRawNumber(ext.wardsPlaced)} / ${formatRawNumber(ext.wardsKilled)}`} />
                          <StatCard label="真眼" value={formatRawNumber(ext.controlWardsBought)} />
                          <StatCard label="治疗" value={formatNumber(ext.healing)} />
                          <StatCard label="控制时长(秒)" value={formatRawNumber(ext.ccTime)} />
                        </div>
                        {ext.damageComposition ? <DamageCompositionBar composition={ext.damageComposition} /> : null}
                        {ext.items.length > 0 ? (
                          <div>
                            <p className="mb-2 text-xs text-muted-foreground">装备 item0-item6</p>
                            <div className="flex flex-wrap gap-2">
                              {ext.items.map((item, index) => (
                                <span
                                  key={`${item}-${index}`}
                                  className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-800"
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <RawStatsBlock rawStats={ext.rawStats} />
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}
