'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { ArenaEmptyState, ArenaPanel } from '@/components/public-arena';
import {
  fromLocalDatetimeString,
  toLocalDatetimeString,
} from '@/components/admin/tournament/datetime-local';

type ReservationMatch = {
  id: string;
  version: number;
  label: string | null;
  roundKey: string | null;
  groupId: string | null;
  scheduledAt: string | null;
  status: string;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  stage: { id: string; type: string; name: string };
};

type ReservationState = {
  tournamentId: string | null;
  scheduled: ReservationMatch[];
  candidates: ReservationMatch[];
};

function matchLabel(match: ReservationMatch): string {
  return `${match.teamA?.name ?? '？'} vs ${match.teamB?.name ?? '？'}`;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: '待赛',
    FINISHED: '已结束',
    CANCELED: '已取消',
    WALKOVER: '轮空',
  };
  return map[status] ?? status;
}

function formatScheduledAt(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(5, 16).replace('T', ' ');
}

export function ReservationDashboard() {
  const [state, setState] = useState<ReservationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [localTimes, setLocalTimes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/captain/reservations');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '加载比赛预约失败');
      }
      const next = (await res.json()) as ReservationState;
      setState(next);
      const values: Record<string, string> = {};
      for (const match of [...next.scheduled, ...next.candidates]) {
        values[match.id] = toLocalDatetimeString(match.scheduledAt);
      }
      setLocalTimes(values);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载比赛预约失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(match: ReservationMatch, scheduledAt: string | null) {
    setBusyId(match.id);
    try {
      const res = await fetch(`/api/captain/reservations/${match.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: match.version, scheduledAt }),
      });
      if (res.ok) {
        await load();
      } else if (res.status === 409) {
        toast.error('该比赛已被修改，已刷新');
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '保存预约失败');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存预约失败');
    } finally {
      setBusyId(null);
    }
  }

  function getLocalTime(match: ReservationMatch): string {
    return localTimes[match.id] ?? toLocalDatetimeString(match.scheduledAt);
  }

  if (loading && !state) {
    return (
      <ArenaPanel className="mx-auto w-full max-w-lg p-6 text-center text-sm text-slate-300">
        加载预约数据中…
      </ArenaPanel>
    );
  }

  if (!state?.tournamentId) {
    return (
      <ArenaEmptyState
        eyebrow="RESERVATION OFFLINE"
        title="暂无可预约赛事"
        description="进入小组赛或淘汰赛后，这里会显示可预约比赛与已预约时间。"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
            MATCH SCHEDULER
          </p>
          <h1 className="mt-2 text-2xl font-black text-white">比赛预约</h1>
          <p className="mt-1 text-sm text-slate-300">预约或修改自己队伍的比赛时间。</p>
        </div>
      </section>

      <ArenaPanel className="space-y-3" title="已预约" eyebrow="LOCKED WINDOWS">
        {state.scheduled.length === 0 && (
          <div className="rounded-md border border-cyan-200/15 bg-white/5 py-8 text-center text-sm text-slate-400">
            暂无已预约比赛
          </div>
        )}
        <div className="grid gap-3">
          {state.scheduled.map((match) => (
            <div key={match.id} className="rounded-md border border-cyan-200/15 bg-slate-950/35 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-white">{matchLabel(match)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {match.stage.name} · {match.label ?? match.roundKey ?? '比赛'} ·{' '}
                    {formatScheduledAt(match.scheduledAt)}
                  </div>
                </div>
                <Badge variant={match.status === 'FINISHED' ? 'default' : 'outline'}>
                  {statusLabel(match.status)}
                </Badge>
              </div>

              {match.status === 'SCHEDULED' && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`scheduled-${match.id}`}>时间</Label>
                    <Input
                      id={`scheduled-${match.id}`}
                      type="datetime-local"
                      value={getLocalTime(match)}
                      onChange={(e) =>
                        setLocalTimes((prev) => ({ ...prev, [match.id]: e.target.value }))
                      }
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={busyId === match.id || !getLocalTime(match)}
                    onClick={() => void save(match, fromLocalDatetimeString(getLocalTime(match)))}
                  >
                    <LoadingButtonContent loading={busyId === match.id} loadingText="保存中…">
                      修改时间
                    </LoadingButtonContent>
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busyId === match.id}
                    onClick={() => void save(match, null)}
                  >
                    <LoadingButtonContent loading={busyId === match.id} loadingText="取消中…">
                      取消预约
                    </LoadingButtonContent>
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </ArenaPanel>

      <ArenaPanel className="space-y-3" title="可预约" eyebrow="AVAILABLE WINDOWS">
        {state.candidates.length === 0 && (
          <div className="rounded-md border border-cyan-200/15 bg-white/5 py-8 text-center text-sm text-slate-400">
            暂无可预约比赛
          </div>
        )}
        <div className="grid gap-3">
          {state.candidates.map((match) => (
            <div key={match.id} className="rounded-md border border-cyan-200/15 bg-slate-950/35 p-3">
              <div className="font-medium text-white">{matchLabel(match)}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {match.stage.name} · {match.label ?? match.roundKey ?? '比赛'}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`candidate-${match.id}`}>时间</Label>
                  <Input
                    id={`candidate-${match.id}`}
                    type="datetime-local"
                    value={getLocalTime(match)}
                    onChange={(e) =>
                      setLocalTimes((prev) => ({ ...prev, [match.id]: e.target.value }))
                    }
                  />
                </div>
                <Button
                  disabled={busyId === match.id || !getLocalTime(match)}
                  onClick={() => void save(match, fromLocalDatetimeString(getLocalTime(match)))}
                >
                  <LoadingButtonContent loading={busyId === match.id} loadingText="创建中…">
                    创建预约
                  </LoadingButtonContent>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ArenaPanel>
    </div>
  );
}
