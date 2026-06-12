'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  splitPlannerColumns,
  parallelCountAt,
  autoSequenceItems,
  type PlannerMatch,
} from '@/lib/tournament/schedule-planner';
import { toLocalDatetimeString, fromLocalDatetimeString } from './datetime-local';
import type { AdminState } from '@/hooks/useTournamentState';

// ─── Types ─────────────────────────────────────────────────────────────────────

type AdminMatch = NonNullable<AdminState>['matches'][number];

type Props = {
  state: AdminState;
  refetch: () => Promise<void>;
  seasonId: string;
  readOnly?: boolean;
};

// ─── DropTimeDialog ────────────────────────────────────────────────────────────
// Shown on desktop after dragging a card onto a day column.

type DropTimeDialogProps = {
  open: boolean;
  onClose: () => void;
  matchLabel: string;
  defaultDatetime: string; // datetime-local format
  onConfirm: (iso: string) => void;
};

function DropTimeDialog({
  open,
  onClose,
  matchLabel,
  defaultDatetime,
  onConfirm,
}: DropTimeDialogProps) {
  const [local, setLocal] = useState(defaultDatetime);

  // Sync default when the dialog (re-)opens
  useEffect(() => {
    if (open) setLocal(defaultDatetime);
  }, [open, defaultDatetime]);

  function handleConfirm() {
    const iso = fromLocalDatetimeString(local);
    if (!iso) return;
    onConfirm(iso);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>设置比赛时间</DialogTitle>
          <DialogDescription>{matchLabel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="drop-time-input">比赛时间</Label>
          <input
            id="drop-time-input"
            type="datetime-local"
            step={300}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            className="w-full rounded-md border bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!local} onClick={handleConfirm}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MobileEditDialog ──────────────────────────────────────────────────────────
// Shown on mobile (pointer:coarse) when tapping a card.

type MobileEditDialogProps = {
  open: boolean;
  onClose: () => void;
  match: AdminMatch | null;
  onSave: (scheduledAt: string | null) => void;
};

function MobileEditDialog({ open, onClose, match, onSave }: MobileEditDialogProps) {
  const [local, setLocal] = useState('');

  useEffect(() => {
    if (open && match) setLocal(toLocalDatetimeString(match.scheduledAt));
  }, [open, match]);

  if (!match) return null;

  const matchLabel = `${match.teamA?.name ?? '待定'} vs ${match.teamB?.name ?? '待定'}`;

  function handleSave() {
    const iso = fromLocalDatetimeString(local);
    onSave(iso);
  }

  function handleUnschedule() {
    onSave(null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>编辑排期</DialogTitle>
          <DialogDescription>{matchLabel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="mobile-time-input">比赛时间</Label>
          <input
            id="mobile-time-input"
            type="datetime-local"
            step={300}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            className="w-full rounded-md border bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleUnschedule}
          >
            移回未排期
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={!local}
            onClick={handleSave}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AutoSequenceDialog ────────────────────────────────────────────────────────

type AutoSequenceDialogProps = {
  open: boolean;
  onClose: () => void;
  poolCount: number;
  onConfirm: (start: Date, intervalMinutes: number) => void;
};

function AutoSequenceDialog({ open, onClose, poolCount, onConfirm }: AutoSequenceDialogProps) {
  const [startLocal, setStartLocal] = useState('');
  const [interval, setInterval] = useState(30);

  useEffect(() => {
    if (open) {
      // Default: next whole hour
      const now = new Date();
      now.setMinutes(0, 0, 0);
      now.setHours(now.getHours() + 1);
      setStartLocal(toLocalDatetimeString(now.toISOString()));
      setInterval(30);
    }
  }, [open]);

  function handleConfirm() {
    const iso = fromLocalDatetimeString(startLocal);
    if (!iso || interval <= 0) return;
    onConfirm(new Date(iso), interval);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>自动顺排</DialogTitle>
          <DialogDescription>
            将对 {poolCount} 场未排期比赛按顺序自动排期
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="auto-seq-start">起始时间</Label>
            <input
              id="auto-seq-start"
              type="datetime-local"
              step={300}
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full rounded-md border bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="auto-seq-interval">间隔（分钟）</Label>
            <Input
              id="auto-seq-interval"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!startLocal || interval <= 0} onClick={handleConfirm}>
            顺排
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MatchCard ─────────────────────────────────────────────────────────────────

type MatchCardProps = {
  match: AdminMatch;
  allMatches: AdminMatch[];
  readOnly: boolean;
  isMobile: boolean;
  onDragStart: (matchId: string) => void;
  onMobileClick: (match: AdminMatch) => void;
};

function MatchCard({
  match,
  allMatches,
  readOnly,
  isMobile,
  onDragStart,
  onMobileClick,
}: MatchCardProps) {
  const teamA = match.teamA?.name ?? '待定';
  const teamB = match.teamB?.name ?? '待定';
  const cardLabel = match.label ?? match.roundKey ?? '小组赛';
  const timeStr = match.scheduledAt
    ? new Date(match.scheduledAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null;

  const parallelN = match.scheduledAt
    ? parallelCountAt(allMatches as PlannerMatch[], match as PlannerMatch)
    : 0;

  const draggable = !readOnly && !isMobile;

  return (
    <div
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData('text/plain', match.id);
              onDragStart(match.id);
            }
          : undefined
      }
      onClick={isMobile && !readOnly ? () => onMobileClick(match) : undefined}
      className={[
        'rounded-md border bg-card p-2 text-sm shadow-sm select-none',
        draggable ? 'cursor-grab active:cursor-grabbing' : '',
        isMobile && !readOnly ? 'cursor-pointer active:opacity-80' : '',
        readOnly ? 'opacity-70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="font-medium truncate">
        {teamA} <span className="text-muted-foreground">vs</span> {teamB}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span>{cardLabel}</span>
        <span>· BO{match.bestOf}</span>
        {timeStr && <span className="font-mono">{timeStr}</span>}
      </div>
      {parallelN > 1 && (
        <Badge variant="outline" className="mt-1 text-xs opacity-60">
          同时段 ×{parallelN}
        </Badge>
      )}
    </div>
  );
}

// ─── SchedulePlanner (main export) ────────────────────────────────────────────

export function SchedulePlanner({ state, refetch, readOnly = false }: Props) {
  const matches: AdminMatch[] = useMemo(
    () => (state?.matches ?? []).filter((m) => m.status !== 'CANCELED'),
    [state?.matches],
  );

  const { pool, columns } = splitPlannerColumns(matches as PlannerMatch[]) as {
    pool: AdminMatch[];
    columns: Array<{
      dayKey: string;
      label: string;
      count: number;
      isPending: boolean;
      matches: AdminMatch[];
    }>;
  };

  // ── Drag state ──
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // ref used inside drag handlers so they always see latest value without closure capture
  const draggingIdRef = useRef<string | null>(null);
  draggingIdRef.current = draggingId;

  // ── Drop time dialog (desktop) ──
  const [dropDialog, setDropDialog] = useState<{
    matchId: string;
    defaultDatetime: string;
    matchLabel: string;
  } | null>(null);

  // ── Mobile edit dialog ──
  const [mobileMatch, setMobileMatch] = useState<AdminMatch | null>(null);
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false);

  // ── Auto-sequence dialog ──
  const [autoSeqOpen, setAutoSeqOpen] = useState(false);

  // ── Mobile detection (client-side only, avoids SSR mismatch) ──
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ─── save (single item) ────────────────────────────────────────────────────
  const save = useCallback(
    async (matchId: string, scheduledAt: string | null) => {
      const m = matches.find((x) => x.id === matchId);
      if (!m) return;
      const res = await fetch('/api/tournament/admin/schedule/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ matchId, expectedVersion: m.version, scheduledAt }],
        }),
      });
      if (res.ok) {
        await refetch();
      } else if (res.status === 409) {
        toast.error('部分比赛已被修改，已刷新');
        await refetch();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? '排期失败');
        await refetch();
      }
    },
    [matches, refetch],
  );

  // ─── Auto-sequence batch save ──────────────────────────────────────────────
  async function handleAutoSequence(start: Date, intervalMinutes: number) {
    setAutoSeqOpen(false);
    const items = autoSequenceItems(pool as PlannerMatch[], { start, intervalMinutes });
    if (items.length === 0) return;
    const res = await fetch('/api/tournament/admin/schedule/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (res.ok) {
      await refetch();
    } else if (res.status === 409) {
      toast.error('部分比赛已被修改，已刷新');
      await refetch();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? '自动顺排失败');
      await refetch();
    }
  }

  // ─── Desktop drag handlers ─────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDropOnColumn(e: React.DragEvent, dayKey: string, dayLabel: string) {
    e.preventDefault();
    const matchId = e.dataTransfer.getData('text/plain') || draggingIdRef.current;
    if (!matchId) return;
    setDraggingId(null);

    const m = matches.find((x) => x.id === matchId);
    if (!m) return;

    // Pre-fill with match's existing time if in the same day, else noon on target day.
    let defaultDatetime: string;
    if (m.scheduledAt) {
      // Use sv-SE locale for YYYY-MM-DD format
      const existingDay = new Date(m.scheduledAt).toLocaleDateString('sv-SE');
      if (existingDay === dayKey) {
        defaultDatetime = toLocalDatetimeString(m.scheduledAt);
      } else {
        defaultDatetime = `${dayKey}T12:00`;
      }
    } else {
      defaultDatetime = `${dayKey}T12:00`;
    }

    const matchLabel = `${m.teamA?.name ?? '待定'} vs ${m.teamB?.name ?? '待定'} · ${dayLabel}`;
    setDropDialog({ matchId, defaultDatetime, matchLabel });
  }

  function handleDropOnPool(e: React.DragEvent) {
    e.preventDefault();
    const matchId = e.dataTransfer.getData('text/plain') || draggingIdRef.current;
    if (!matchId) return;
    setDraggingId(null);
    void save(matchId, null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            disabled={pool.length === 0}
            onClick={() => setAutoSeqOpen(true)}
          >
            自动顺排
          </Button>
        )}
        {readOnly && (
          <p className="text-sm text-muted-foreground">赛季已归档，排期只读</p>
        )}
      </div>

      {/* Planner board */}
      <div className="flex min-h-80 gap-3 overflow-x-auto pb-2">
        {/* ── Unscheduled pool ── */}
        <div
          className="flex w-52 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2"
          onDragOver={!readOnly ? handleDragOver : undefined}
          onDrop={!readOnly ? handleDropOnPool : undefined}
        >
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            未排期池 · {pool.length} 场
          </div>
          {pool.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">所有比赛已排期</p>
          )}
          {pool.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              allMatches={matches}
              readOnly={readOnly}
              isMobile={isMobile}
              onDragStart={setDraggingId}
              onMobileClick={(match) => {
                setMobileMatch(match);
                setMobileDialogOpen(true);
              }}
            />
          ))}
        </div>

        {/* ── Day columns ── */}
        {columns.map((col) => (
          <div
            key={col.dayKey}
            className="flex w-52 shrink-0 flex-col gap-2 rounded-lg border bg-muted/20 p-2"
            onDragOver={!readOnly ? handleDragOver : undefined}
            onDrop={
              !readOnly ? (e) => handleDropOnColumn(e, col.dayKey, col.label) : undefined
            }
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {col.label} · {col.count} 场
            </div>
            {col.matches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                allMatches={matches}
                readOnly={readOnly}
                isMobile={isMobile}
                onDragStart={setDraggingId}
                onMobileClick={(match) => {
                  setMobileMatch(match);
                  setMobileDialogOpen(true);
                }}
              />
            ))}
          </div>
        ))}

        {/* Empty state */}
        {columns.length === 0 && pool.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            暂无比赛
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      <DropTimeDialog
        open={!!dropDialog}
        onClose={() => setDropDialog(null)}
        matchLabel={dropDialog?.matchLabel ?? ''}
        defaultDatetime={dropDialog?.defaultDatetime ?? ''}
        onConfirm={(iso) => {
          if (dropDialog) void save(dropDialog.matchId, iso);
          setDropDialog(null);
        }}
      />

      <MobileEditDialog
        open={mobileDialogOpen}
        onClose={() => {
          setMobileDialogOpen(false);
          setMobileMatch(null);
        }}
        match={mobileMatch}
        onSave={(scheduledAt) => {
          if (mobileMatch) void save(mobileMatch.id, scheduledAt);
          setMobileDialogOpen(false);
          setMobileMatch(null);
        }}
      />

      <AutoSequenceDialog
        open={autoSeqOpen}
        onClose={() => setAutoSeqOpen(false)}
        poolCount={pool.length}
        onConfirm={(start, intervalMinutes) => void handleAutoSequence(start, intervalMinutes)}
      />
    </div>
  );
}
