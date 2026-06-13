'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScoreDialog } from './ScoreDialog';
import { toLocalDatetimeString, fromLocalDatetimeString } from './datetime-local';
import type { AdminState } from '@/hooks/useTournamentState';

type Team = { id: string; name: string };
type MatchRow = NonNullable<AdminState>['matches'][number];

type Props = {
  teams: Team[];
  state: AdminState;
  refetch: () => Promise<void>;
  seasonId: string;
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>设置轮空</DialogTitle>
          <DialogDescription>
            {match.teamA?.name ?? '？'} vs {match.teamB?.name ?? '？'} · 选择获得轮空胜利的队伍
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>胜方</Label>
          <Select value={winnerId} onValueChange={setWinnerId}>
            <SelectTrigger>
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
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button disabled={!winnerId || busy} onClick={() => onConfirm(winnerId)}>
            <LoadingButtonContent loading={busy} loadingText="确认中…">
              确认轮空
            </LoadingButtonContent>
          </Button>
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>自定义比赛</DialogTitle>
          <DialogDescription className="sr-only">添加自定义比赛</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>所属小组（可空）</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger>
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
            <div className="space-y-1">
              <Label>队伍 A</Label>
              <Select value={teamAId} onValueChange={setTeamAId}>
                <SelectTrigger>
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
            <div className="space-y-1">
              <Label>队伍 B</Label>
              <Select value={teamBId} onValueChange={setTeamBId}>
                <SelectTrigger>
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
            <div className="space-y-1">
              <Label>BO</Label>
              <Select value={String(bestOf)} onValueChange={(v) => setBestOf(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">BO1</SelectItem>
                  <SelectItem value="3">BO3</SelectItem>
                  <SelectItem value="5">BO5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cm-label">名称</Label>
              <Input
                id="cm-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="可选"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={countsForStandings}
              onCheckedChange={(v) => setCountsForStandings(!!v)}
            />
            计入积分
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button disabled={!formValid || saving} onClick={() => void handleSubmit()}>
            <LoadingButtonContent loading={saving} loadingText="添加中…">
              添加
            </LoadingButtonContent>
          </Button>
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
  const [addMatchOpen, setAddMatchOpen] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [localTimes, setLocalTimes] = useState<Record<string, string>>({});

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
      <div className="pt-4 text-muted-foreground text-sm">
        请先在「设置」tab 创建赛事并确认分组。
      </div>
    );
  }

  const groupMatches = matches.filter((m) => m.groupId !== null);
  const allGroupsDone =
    groupMatches.length > 0 && groupMatches.every((m) => m.status !== 'SCHEDULED');
  const showCloseGroups = tournament.status === 'GROUP_STAGE' && allGroupsDone;

  async function handleReschedule(match: MatchRow, localVal: string) {
    const scheduledAt = fromLocalDatetimeString(localVal);
    setReschedulingId(match.id);
    try {
      const res = await fetch(`/api/tournament/admin/matches/${match.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'reschedule', expectedVersion: match.version, scheduledAt }),
      });
      if (res.ok) {
        await refetch();
      } else if (res.status === 409) {
        toast.error('该比赛已被修改，已刷新');
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '修改时间失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '修改时间失败');
    } finally {
      setReschedulingId(null);
    }
  }

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

  async function handleCloseGroups() {
    if (!tournament) return;
    if (!window.confirm('确认收小组进淘汰赛？将根据积分排名生成淘汰赛对阵。')) return;
    setClosingGroups(true);
    try {
      const res = await fetch('/api/tournament/admin/close-groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tournamentId: tournament.id }),
      });
      if (res.ok) {
        toast.success('小组赛已结束，淘汰赛对阵已生成');
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.code === 'STANDINGS_TIED') {
          toast.error(
            `积分并列：${data.error ?? '存在积分相同队伍，请先安排加赛决出排名'}`,
          );
        } else {
          toast.error(data.error ?? '操作失败');
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setClosingGroups(false);
    }
  }

  function getLocalTime(match: MatchRow): string {
    if (match.id in localTimes) return localTimes[match.id];
    return toLocalDatetimeString(match.scheduledAt);
  }

  return (
    <div className="space-y-4 pt-4">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {tournament.status !== 'SETUP' && (
          <Button size="sm" variant="outline" onClick={() => setAddMatchOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            自定义比赛
          </Button>
        )}

        {showCloseGroups && (
          <Button size="sm" disabled={closingGroups} onClick={() => void handleCloseGroups()}>
            <LoadingButtonContent loading={closingGroups} loadingText="处理中…">
              收小组进淘汰赛
            </LoadingButtonContent>
          </Button>
        )}
      </div>

      {/* Matches table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>阶段</TableHead>
              <TableHead>组别/轮次</TableHead>
              <TableHead>对阵双方</TableHead>
              <TableHead>时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  暂无比赛
                </TableCell>
              </TableRow>
            )}
            {matches.map((m) => {
              const localVal = getLocalTime(m);
              const originalVal = toLocalDatetimeString(m.scheduledAt);
              const isDirty = localVal !== originalVal;
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-sm">{stageLabel(m)}</TableCell>
                  <TableCell className="text-sm">{roundLabel(m, standings)}</TableCell>
                  <TableCell className="text-sm">
                    <span>{m.teamA?.name ?? '？'}</span>
                    <span className="mx-1 text-muted-foreground">vs</span>
                    <span>{m.teamB?.name ?? '？'}</span>
                    {m.winnerTeamId && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (胜:{' '}
                        {m.teamA?.id === m.winnerTeamId ? m.teamA?.name : m.teamB?.name})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <input
                      type="datetime-local"
                      className="rounded-md border bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                      value={localVal}
                      disabled={reschedulingId === m.id}
                      onChange={(e) =>
                        setLocalTimes((prev) => ({ ...prev, [m.id]: e.target.value }))
                      }
                      onBlur={() => {
                        if (isDirty) void handleReschedule(m, localVal);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        m.status === 'FINISHED'
                          ? 'default'
                          : m.status === 'CANCELED'
                            ? 'destructive'
                            : 'outline'
                      }
                    >
                      {statusLabel(m.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={m.status === 'CANCELED'}
                        onClick={() => setScoreMatchId(m.id)}
                      >
                        录比分
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={m.status !== 'SCHEDULED'}
                        onClick={() => setWalkoverMatch(m)}
                      >
                        轮空
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={m.status === 'CANCELED' || cancelingId === m.id}
                        onClick={() => void handleCancel(m)}
                      >
                        <LoadingButtonContent loading={cancelingId === m.id} loadingText="…">
                          取消
                        </LoadingButtonContent>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      <ScoreDialog
        match={scoreMatch}
        open={!!scoreMatch}
        onClose={() => setScoreMatchId(null)}
        refetch={refetch}
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
    </div>
  );
}
