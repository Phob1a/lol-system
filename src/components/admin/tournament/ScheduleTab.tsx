'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScoreDialog } from './ScoreDialog';
import { ReservationDialog } from './ReservationDialog';
import {
  KnockoutSeedingDialog,
  type KnockoutSeedingDraft,
} from './KnockoutSeedingDialog';
import type { AdminState } from '@/hooks/useTournamentState';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import NexusButton from '@/components/nexus/NexusButton';
import Readout from '@/components/nexus/Readout';

type Team = { id: string; name: string };
type MatchRow = NonNullable<AdminState>['matches'][number];

type Props = {
  teams: Team[];
  state: AdminState;
  refetch: () => Promise<void>;
};

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: '待赛',
    FINISHED: '已结束',
    CANCELED: '已取消',
    WALKOVER: '轮空',
  };
  return map[status] ?? status;
}

function stageLabel(m: MatchRow): string {
  if (m.groupId !== null) return '小组赛';
  if (m.roundKey !== null) return '淘汰赛';
  return '自定义';
}

function roundLabel(m: MatchRow, standings: NonNullable<AdminState>['standings']): string {
  if (m.groupId) {
    const g = standings.find((s) => s.groupId === m.groupId);
    return g?.name ?? '未知组';
  }
  return m.roundKey ?? m.label ?? '—';
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

// ─── WalkoverDialog ───────────────────────────────────────────────────────────

function WalkoverDialog({
  match,
  open,
  onClose,
  onConfirm,
  busy,
}: {
  match: MatchRow | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (winnerTeamId: string) => void;
  busy: boolean;
}) {
  const [winnerId, setWinnerId] = useState('');

  if (!match) return null;

  const options = [
    ...(match.teamA ? [{ id: match.teamA.id, name: match.teamA.name }] : []),
    ...(match.teamB ? [{ id: match.teamB.id, name: match.teamB.name }] : []),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setWinnerId('');
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-sm bg-nexus-panel border-nexus-line">
        <DialogHeader>
          <DialogTitle className="font-display text-nexus-ink">设置轮空</DialogTitle>
          <DialogDescription className="font-mono text-[11px] text-nexus-faint">
            {match.teamA?.name ?? '？'} vs {match.teamB?.name ?? '？'} · 选择获得轮空胜利的队伍
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
            胜方
          </Label>
          <Select value={winnerId} onValueChange={setWinnerId}>
            <SelectTrigger className="bg-nexus-bg border-nexus-line text-nexus-ink">
              <SelectValue placeholder="选择队伍" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <NexusButton onClick={onClose} disabled={busy}>
            取消
          </NexusButton>
          <NexusButton variant="primary" disabled={!winnerId || busy} onClick={() => onConfirm(winnerId)}>
            <LoadingButtonContent loading={busy} loadingText="确认中…">
              确认轮空
            </LoadingButtonContent>
          </NexusButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AddMatchDialog ───────────────────────────────────────────────────────────

function AddMatchDialog({
  open,
  onClose,
  tournament,
  teams,
  standings,
  refetch,
}: {
  open: boolean;
  onClose: () => void;
  tournament: NonNullable<AdminState>['tournament'];
  teams: Team[];
  standings: NonNullable<AdminState>['standings'];
  refetch: () => Promise<void>;
}) {
  const [groupId, setGroupId] = useState<string>('__none__');
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [bestOf, setBestOf] = useState(1);
  const [label, setLabel] = useState('');
  const [countsForStandings, setCountsForStandings] = useState(true);
  const [saving, setSaving] = useState(false);

  function reset() {
    setGroupId('__none__');
    setTeamAId('');
    setTeamBId('');
    setBestOf(1);
    setLabel('');
    setCountsForStandings(true);
  }

  async function handleSubmit() {
    if (!teamAId || !teamBId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tournament/admin/matches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tournament.id,
          groupId: groupId === '__none__' ? null : groupId,
          teamAId,
          teamBId,
          bestOf,
          label: label.trim() || `自定义`,
          countsForStandings,
        }),
      });
      if (res.ok) {
        toast.success('自定义比赛已添加');
        reset();
        onClose();
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '添加失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSaving(false);
    }
  }

  const formValid = !!teamAId && !!teamBId && teamAId !== teamBId && bestOf > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md bg-nexus-panel border-nexus-line">
        <DialogHeader>
          <DialogTitle className="font-display text-nexus-ink">自定义比赛</DialogTitle>
          <DialogDescription className="sr-only">添加自定义比赛</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
              所属小组（可空）
            </Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="bg-nexus-bg border-nexus-line text-nexus-ink">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">无</SelectItem>
                {standings.map((g) => (
                  <SelectItem key={g.groupId} value={g.groupId}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
                队伍 A
              </Label>
              <Select value={teamAId} onValueChange={setTeamAId}>
                <SelectTrigger className="bg-nexus-bg border-nexus-line text-nexus-ink">
                  <SelectValue placeholder="选择队伍" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
                队伍 B
              </Label>
              <Select value={teamBId} onValueChange={setTeamBId}>
                <SelectTrigger className="bg-nexus-bg border-nexus-line text-nexus-ink">
                  <SelectValue placeholder="选择队伍" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
                BO
              </Label>
              <Select value={String(bestOf)} onValueChange={(v) => setBestOf(Number(v))}>
                <SelectTrigger className="bg-nexus-bg border-nexus-line text-nexus-ink">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">BO1</SelectItem>
                  <SelectItem value="3">BO3</SelectItem>
                  <SelectItem value="5">BO5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="cm-label"
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint"
              >
                名称
              </Label>
              <Input
                id="cm-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="可选"
                className="bg-nexus-bg border-nexus-line text-nexus-ink placeholder:text-nexus-faint focus-visible:ring-nexus-accent"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 font-mono text-[12px] text-nexus-dim cursor-pointer">
            <Checkbox
              checked={countsForStandings}
              onCheckedChange={(v) => setCountsForStandings(!!v)}
            />
            计入积分
          </label>
        </div>

        <DialogFooter>
          <NexusButton onClick={onClose} disabled={saving}>
            取消
          </NexusButton>
          <NexusButton
            variant="primary"
            disabled={!formValid || saving}
            onClick={() => void handleSubmit()}
          >
            <LoadingButtonContent loading={saving} loadingText="添加中…">
              添加
            </LoadingButtonContent>
          </NexusButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ScheduleTab (main export) ────────────────────────────────────────────────

export function ScheduleTab({ teams, state, refetch }: Props) {
  const [scoreMatchId, setScoreMatchId] = useState<string | null>(null);
  const [walkoverMatch, setWalkoverMatch] = useState<MatchRow | null>(null);
  const [walkoverBusy, setWalkoverBusy] = useState(false);
  const [closingGroups, setClosingGroups] = useState(false);
  const [seedingDraft, setSeedingDraft] = useState<KnockoutSeedingDraft | null>(null);
  const [seedingOpen, setSeedingOpen] = useState(false);
  const [addMatchOpen, setAddMatchOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<MatchRow | null>(null);
  const [clearingReservationId, setClearingReservationId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const tournament = state?.tournament ?? null;
  const stateMatches = state?.matches;
  const matches = stateMatches ?? [];
  const standings = state?.standings ?? [];

  const scoreMatch = useMemo(
    () => (scoreMatchId ? (stateMatches?.find((m) => m.id === scoreMatchId) ?? null) : null),
    [scoreMatchId, stateMatches],
  );

  if (!tournament) {
    return (
      <div className="font-mono text-[11px] text-nexus-faint py-4">
        请先在「设置」tab 创建赛事并确认分组。
      </div>
    );
  }

  const groupMatches = matches.filter((m) => m.groupId !== null);
  const allGroupsDone =
    groupMatches.length > 0 && groupMatches.every((m) => m.status !== 'SCHEDULED');
  const showCloseGroups = tournament.status === 'GROUP_STAGE' && allGroupsDone;

  async function handleCancel(match: MatchRow) {
    if (
      !window.confirm(
        `确认取消比赛：${match.teamA?.name ?? '？'} vs ${match.teamB?.name ?? '？'}？`,
      )
    )
      return;
    setCancelingId(match.id);
    try {
      const res = await fetch(`/api/tournament/admin/matches/${match.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'cancel', expectedVersion: match.version }),
      });
      if (res.ok) {
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '取消失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '取消失败');
    } finally {
      setCancelingId(null);
    }
  }

  async function handleClearReservation(match: MatchRow) {
    setClearingReservationId(match.id);
    try {
      const res = await fetch(`/api/tournament/admin/reservations/${match.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: match.version, scheduledAt: null }),
      });
      if (res.ok) {
        await refetch();
      } else if (res.status === 409) {
        toast.error('该比赛已被修改，已刷新');
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '取消预约失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '取消预约失败');
    } finally {
      setClearingReservationId(null);
    }
  }

  async function handleWalkover(winnerTeamId: string) {
    if (!walkoverMatch) return;
    setWalkoverBusy(true);
    try {
      const res = await fetch(
        `/api/tournament/admin/matches/${walkoverMatch.id}/walkover`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: walkoverMatch.version, winnerTeamId }),
        },
      );
      if (res.ok) {
        toast.success('轮空已设置');
        setWalkoverMatch(null);
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '设置轮空失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '设置轮空失败');
    } finally {
      setWalkoverBusy(false);
    }
  }

  async function handleOpenKnockoutSeeding() {
    if (!tournament) return;
    setClosingGroups(true);
    try {
      const res = await fetch(
        `/api/tournament/admin/knockout-seeding?tournamentId=${encodeURIComponent(tournament.id)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { draft: KnockoutSeedingDraft };
        setSeedingDraft(data.draft);
        setSeedingOpen(true);
      } else {
        const data = await res.json().catch(() => ({})) as { code?: string; error?: string };
        if (res.status === 409 && data.code === 'STANDINGS_TIED') {
          toast.error(
            `积分并列：${data.error ?? '存在积分相同队伍，请先安排加赛决出排名'}`,
          );
        } else {
          toast.error(data.error ?? '加载淘汰赛排位失败');
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载淘汰赛排位失败');
    } finally {
      setClosingGroups(false);
    }
  }

  const scheduledMatches = matches.filter((m) => m.scheduledAt !== null);

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {(tournament.status === 'GROUP_STAGE' || tournament.status === 'KNOCKOUT') && (
          <NexusButton size="sm" variant="primary" onClick={() => setReservationOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            创建预约
          </NexusButton>
        )}

        {(tournament.status === 'GROUP_STAGE' || tournament.status === 'KNOCKOUT') && (
          <NexusButton size="sm" onClick={() => setAddMatchOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            自定义比赛
          </NexusButton>
        )}

        {showCloseGroups && (
          <NexusButton
            size="sm"
            variant="primary"
            disabled={closingGroups}
            onClick={() => void handleOpenKnockoutSeeding()}
          >
            <LoadingButtonContent loading={closingGroups} loadingText="处理中…">
              收小组进淘汰赛
            </LoadingButtonContent>
          </NexusButton>
        )}
      </div>

      {/* Matches table */}
      <div className="overflow-x-auto rounded-[var(--radius-nexus)] border border-nexus-line">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['阶段', '组别/轮次', '对阵双方', '时间', '状态', '操作'].map((h) => (
                <th
                  key={h}
                  className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-nexus-faint font-semibold text-left px-4 py-3 border-b border-nexus-line"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scheduledMatches.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-10 text-center font-mono text-[11px] text-nexus-faint"
                >
                  暂无已预约比赛，可点击创建预约
                </td>
              </tr>
            )}
            {scheduledMatches.map((m) => {
              const canEditReservation = m.status === 'SCHEDULED';
              return (
                <tr key={m.id} className="hover:bg-nexus-panel-2/60 transition-colors">
                  <td className="px-4 py-3 border-b border-nexus-line/40 font-mono text-[11px] text-nexus-dim">
                    {stageLabel(m)}
                  </td>
                  <td className="px-4 py-3 border-b border-nexus-line/40 font-mono text-[11px] text-nexus-dim">
                    {roundLabel(m, standings)}
                  </td>
                  <td className="px-4 py-3 border-b border-nexus-line/40">
                    <span className="font-body text-[13px] text-nexus-ink">{m.teamA?.name ?? '？'}</span>
                    <span className="mx-1.5 font-mono text-[11px] text-nexus-faint">vs</span>
                    <span className="font-body text-[13px] text-nexus-ink">{m.teamB?.name ?? '？'}</span>
                    {m.winnerTeamId && (
                      <span className="ml-1.5 font-mono text-[10px] text-nexus-good">
                        (胜:{' '}
                        {m.teamA?.id === m.winnerTeamId ? m.teamA?.name : m.teamB?.name})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 border-b border-nexus-line/40">
                    <Readout className="text-[11px] text-nexus-dim">
                      {formatScheduledAt(m.scheduledAt)}
                    </Readout>
                  </td>
                  <td className="px-4 py-3 border-b border-nexus-line/40">
                    <Chip
                      variant={
                        m.status === 'FINISHED'
                          ? 'good'
                          : m.status === 'CANCELED'
                            ? 'default'
                            : 'ac'
                      }
                    >
                      {statusLabel(m.status)}
                    </Chip>
                  </td>
                  <td className="px-4 py-3 border-b border-nexus-line/40">
                    <div className="flex flex-wrap gap-1">
                      <NexusButton
                        size="sm"
                        disabled={!canEditReservation}
                        onClick={() => setEditingReservation(m)}
                      >
                        修改时间
                      </NexusButton>
                      <NexusButton
                        size="sm"
                        disabled={!canEditReservation || clearingReservationId === m.id}
                        onClick={() => void handleClearReservation(m)}
                      >
                        <LoadingButtonContent
                          loading={clearingReservationId === m.id}
                          loadingText="…"
                        >
                          取消预约
                        </LoadingButtonContent>
                      </NexusButton>
                      <NexusButton
                        size="sm"
                        disabled={m.status === 'CANCELED'}
                        onClick={() => setScoreMatchId(m.id)}
                      >
                        录比分
                      </NexusButton>
                      <NexusButton
                        size="sm"
                        disabled={m.status !== 'SCHEDULED'}
                        onClick={() => setWalkoverMatch(m)}
                      >
                        轮空
                      </NexusButton>
                      <NexusButton
                        size="sm"
                        className="border-nexus-bad/40 text-nexus-bad hover:border-nexus-bad hover:text-nexus-bad"
                        disabled={m.status === 'CANCELED' || cancelingId === m.id}
                        onClick={() => void handleCancel(m)}
                      >
                        <LoadingButtonContent loading={cancelingId === m.id} loadingText="…">
                          取消比赛
                        </LoadingButtonContent>
                      </NexusButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Dialogs */}
      <ScoreDialog
        match={scoreMatch}
        open={!!scoreMatch}
        onClose={() => setScoreMatchId(null)}
        refetch={refetch}
      />

      <ReservationDialog
        open={reservationOpen}
        onClose={() => setReservationOpen(false)}
        tournamentId={tournament.id}
        refetch={refetch}
      />

      <ReservationDialog
        open={editingReservation !== null}
        onClose={() => setEditingReservation(null)}
        tournamentId={tournament.id}
        refetch={refetch}
        editingMatch={editingReservation}
      />

      <WalkoverDialog
        match={walkoverMatch}
        open={!!walkoverMatch}
        onClose={() => setWalkoverMatch(null)}
        onConfirm={(winnerId) => void handleWalkover(winnerId)}
        busy={walkoverBusy}
      />

      <AddMatchDialog
        open={addMatchOpen}
        onClose={() => setAddMatchOpen(false)}
        tournament={tournament}
        teams={teams}
        standings={standings}
        refetch={refetch}
      />

      <KnockoutSeedingDialog
        open={seedingOpen}
        draft={seedingDraft}
        onClose={() => setSeedingOpen(false)}
        refetch={refetch}
      />
    </div>
  );
}
