'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { fromLocalDatetimeString, toLocalDatetimeString } from './datetime-local';
import NexusButton from '@/components/nexus/NexusButton';

type ReservationMatch = {
  id: string;
  version: number;
  label?: string | null;
  roundKey?: string | null;
  groupId?: string | null;
  scheduledAt: string | null;
  teamA: { name: string } | null;
  teamB: { name: string } | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  refetch: () => Promise<void>;
  editingMatch?: ReservationMatch | null;
};

function matchLabel(match: ReservationMatch): string {
  return `${match.teamA?.name ?? '？'} vs ${match.teamB?.name ?? '？'}`;
}

export function ReservationDialog({
  open,
  onClose,
  tournamentId,
  refetch,
  editingMatch = null,
}: Props) {
  const [candidates, setCandidates] = useState<ReservationMatch[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEdit = editingMatch !== null;
  const selectedMatch = useMemo(
    () => (isEdit ? editingMatch : candidates.find((m) => m.id === selectedId) ?? null),
    [candidates, editingMatch, isEdit, selectedId],
  );

  useEffect(() => {
    if (!open) return;

    setLocalTime(toLocalDatetimeString(editingMatch?.scheduledAt ?? null));

    if (editingMatch) {
      setCandidates([]);
      setSelectedId(editingMatch.id);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setCandidates([]);
    setSelectedId('');

    fetch(`/api/tournament/admin/reservations/candidates?tournamentId=${tournamentId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? '加载可预约比赛失败');
        }
        return res.json() as Promise<{ matches: ReservationMatch[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setCandidates(data.matches);
        setSelectedId(data.matches[0]?.id ?? '');
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : '加载可预约比赛失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editingMatch, open, tournamentId]);

  async function submit() {
    if (!selectedMatch) return;
    const scheduledAt = fromLocalDatetimeString(localTime);
    if (!scheduledAt) {
      toast.error('请选择预约时间');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/tournament/admin/reservations/${selectedMatch.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: selectedMatch.version, scheduledAt }),
      });
      if (res.ok) {
        onClose();
        try {
          await refetch();
        } catch {
          toast.error('预约已保存，但刷新失败，请手动刷新页面');
        }
      } else if (res.status === 409) {
        toast.error('该比赛已被修改，已刷新');
        onClose();
        try {
          await refetch();
        } catch {
          toast.error('刷新失败，请手动刷新页面');
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '保存预约失败');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存预约失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-lg bg-nexus-panel border-nexus-line">
        <DialogHeader>
          <DialogTitle className="font-display text-nexus-ink">
            {isEdit ? '修改预约时间' : '创建预约'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? '修改已预约比赛时间' : '从候选比赛中创建预约'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
                比赛
              </label>
              {loading && (
                <div className="font-mono text-[11px] text-nexus-faint">加载中…</div>
              )}
              {!loading && candidates.length === 0 && (
                <div className="rounded-[var(--radius-nexus)] border border-nexus-line/60 py-8 text-center font-mono text-[11px] text-nexus-faint">
                  暂无可预约比赛
                </div>
              )}
              {!loading && candidates.length > 0 && (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {candidates.map((match) => (
                    <button
                      key={match.id}
                      type="button"
                      className={[
                        'w-full rounded-[var(--radius-nexus)] border px-3 py-2 text-left transition-colors cursor-pointer',
                        selectedId === match.id
                          ? 'border-nexus-accent/60 bg-nexus-accent/5'
                          : 'border-nexus-line hover:border-nexus-accent/40 hover:bg-nexus-panel-2',
                      ].join(' ')}
                      onClick={() => setSelectedId(match.id)}
                    >
                      <div className="font-body text-[13px] text-nexus-ink">
                        {matchLabel(match)}
                      </div>
                      <div className="font-mono text-[10px] text-nexus-faint mt-0.5">
                        {match.label ?? match.roundKey ?? '待预约比赛'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isEdit && selectedMatch && (
            <div className="rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 px-3 py-2">
              <div className="font-body text-[13px] text-nexus-ink">{matchLabel(selectedMatch)}</div>
              <div className="font-mono text-[10px] text-nexus-faint mt-0.5">
                {selectedMatch.label ?? selectedMatch.roundKey ?? '已预约比赛'}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="reservation-time"
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint"
            >
              时间
            </label>
            <Input
              id="reservation-time"
              type="datetime-local"
              value={localTime}
              onChange={(e) => setLocalTime(e.target.value)}
              className="bg-nexus-bg border-nexus-line text-nexus-ink focus-visible:ring-nexus-accent"
            />
          </div>
        </div>

        <DialogFooter>
          <NexusButton disabled={saving} onClick={onClose}>
            取消
          </NexusButton>
          <NexusButton
            variant="primary"
            disabled={!selectedMatch || !localTime || saving}
            onClick={() => void submit()}
          >
            <LoadingButtonContent loading={saving} loadingText="保存中…">
              {isEdit ? '保存时间' : '创建预约'}
            </LoadingButtonContent>
          </NexusButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
