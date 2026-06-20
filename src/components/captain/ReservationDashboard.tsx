'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import {
  fromLocalDatetimeString,
  toLocalDatetimeString,
} from '@/components/admin/tournament/datetime-local';
import Panel from '@/components/nexus/Panel';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import NexusButton from '@/components/nexus/NexusButton';
import Field from '@/components/nexus/Field';

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
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
      <p className="font-mono text-[12px] text-nexus-faint">加载中…</p>
    );
  }

  if (!state?.tournamentId) {
    return (
      <p className="font-mono text-[12px] text-nexus-faint">暂无可预约赛事</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="space-y-1">
        <h1 className="font-display text-xl font-semibold text-nexus-ink">比赛预约</h1>
        <p className="font-mono text-[12px] text-nexus-dim">预约或修改自己队伍的比赛时间。</p>
      </section>

      {/* Scheduled matches */}
      <section className="space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-faint">已预约</h2>
        {state.scheduled.length === 0 && (
          <Panel className="py-8 text-center">
            <Kicker>暂无已预约比赛</Kicker>
          </Panel>
        )}
        <div className="grid gap-3">
          {state.scheduled.map((match) => (
            <Panel key={match.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-body text-[13px] font-medium text-nexus-ink">
                    {matchLabel(match)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-nexus-dim tabular-nums">
                    {match.stage.name}
                    {' · '}
                    {match.label ?? match.roundKey ?? '比赛'}
                    {' · '}
                    {formatScheduledAt(match.scheduledAt)}
                  </p>
                </div>
                <Chip variant={match.status === 'FINISHED' ? 'good' : 'default'}>
                  {statusLabel(match.status)}
                </Chip>
              </div>

              {match.status === 'SCHEDULED' && (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`scheduled-${match.id}`}
                      className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint"
                    >
                      时间
                    </label>
                    <Field
                      id={`scheduled-${match.id}`}
                      type="datetime-local"
                      value={getLocalTime(match)}
                      onChange={(e) =>
                        setLocalTimes((prev) => ({ ...prev, [match.id]: e.target.value }))
                      }
                      className="tabular-nums"
                    />
                  </div>
                  <NexusButton
                    disabled={busyId === match.id || !getLocalTime(match)}
                    onClick={() => void save(match, fromLocalDatetimeString(getLocalTime(match)))}
                  >
                    <LoadingButtonContent loading={busyId === match.id} loadingText="保存中…">
                      修改时间
                    </LoadingButtonContent>
                  </NexusButton>
                  <NexusButton
                    disabled={busyId === match.id}
                    onClick={() => void save(match, null)}
                  >
                    <LoadingButtonContent loading={busyId === match.id} loadingText="取消中…">
                      取消预约
                    </LoadingButtonContent>
                  </NexusButton>
                </div>
              )}
            </Panel>
          ))}
        </div>
      </section>

      {/* Candidate matches */}
      <section className="space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-faint">可预约</h2>
        {state.candidates.length === 0 && (
          <Panel className="py-8 text-center">
            <Kicker>暂无可预约比赛</Kicker>
          </Panel>
        )}
        <div className="grid gap-3">
          {state.candidates.map((match) => (
            <Panel key={match.id} className="p-4">
              <p className="font-body text-[13px] font-medium text-nexus-ink">
                {matchLabel(match)}
              </p>
              <p className="mt-1 font-mono text-[11px] text-nexus-dim">
                {match.stage.name}
                {' · '}
                {match.label ?? match.roundKey ?? '比赛'}
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`candidate-${match.id}`}
                    className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint"
                  >
                    时间
                  </label>
                  <Field
                    id={`candidate-${match.id}`}
                    type="datetime-local"
                    value={getLocalTime(match)}
                    onChange={(e) =>
                      setLocalTimes((prev) => ({ ...prev, [match.id]: e.target.value }))
                    }
                    className="tabular-nums"
                  />
                </div>
                <NexusButton
                  variant="primary"
                  disabled={busyId === match.id || !getLocalTime(match)}
                  onClick={() => void save(match, fromLocalDatetimeString(getLocalTime(match)))}
                >
                  <LoadingButtonContent loading={busyId === match.id} loadingText="创建中…">
                    创建预约
                  </LoadingButtonContent>
                </NexusButton>
              </div>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}
