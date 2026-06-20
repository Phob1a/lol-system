'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Tournament, TournamentStatus } from '@prisma/client';
import type { RegistrationWithPlayer } from '@/lib/registration/registration-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { ArenaPanel } from '@/components/public-arena';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Eye, EyeOff } from 'lucide-react';

// ─── constants ────────────────────────────────────────────────────────────────

// Mirror of registration-service `ROSTER_EDITABLE_STATUSES`. Once a tournament
// reaches DRAFTING, the backend rejects roster mutations;
// disabling the controls here keeps the UI honest.
const ROSTER_EDITABLE: ReadonlySet<TournamentStatus> = new Set([
  'SETUP',
  'REGISTRATION',
  'ROSTER_LOCKED',
] as TournamentStatus[]);

const POSITION_LABELS: Record<string, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MID: '中单',
  ADC: '射手',
  SUPPORT: '辅助',
};
const ALL_POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;
type Position = (typeof ALL_POSITIONS)[number];

function posLabel(p: string) {
  return POSITION_LABELS[p] ?? p;
}
function posLabels(arr: string[]) {
  return arr.map(posLabel).join('、');
}

// ─── sub-components ───────────────────────────────────────────────────────────

/** Reusable checkbox group for selecting positions. */
function PositionCheckGroup({
  label,
  scope,
  value,
  onChange,
  exclude,
}: {
  label: string;
  scope: string;
  value: Position[];
  onChange: (v: Position[]) => void;
  exclude?: Position[];
}) {
  function toggle(p: Position) {
    if (value.includes(p)) {
      onChange(value.filter((x) => x !== p));
    } else {
      onChange([...value, p]);
    }
  }
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-3">
        {ALL_POSITIONS.map((p) => {
          const disabled = exclude?.includes(p) ?? false;
          return (
            <div key={p} className="flex items-center gap-1">
              <Checkbox
                id={`pos-${scope}-${label}-${p}`}
                checked={value.includes(p)}
                disabled={disabled}
                onCheckedChange={() => !disabled && toggle(p)}
              />
              <label
                htmlFor={`pos-${scope}-${label}-${p}`}
                className="text-xs cursor-pointer select-none"
              >
                {posLabel(p)}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Dialog shown after appointing a captain, displaying generated credentials. */
function CredentialsDialog({
  open,
  onClose,
  creds,
}: {
  open: boolean;
  onClose: () => void;
  creds: { teamId: string; username: string; password: string } | null;
}) {
  // Default: password visible. One-time credentials need to be copied or
  // verified by the admin, and forcing a mask up-front adds friction during
  // hand-off. The Eye/EyeOff toggle exists for shared-screen scenarios.
  const [reveal, setReveal] = useState(true);

  // Reset to revealed each time the dialog (re)opens so the previous state
  // doesn't leak across captain appointments.
  useEffect(() => {
    if (open) setReveal(true);
  }, [open]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制`);
    } catch {
      toast.error(`${label}复制失败，请手动复制`);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            队长账号已创建
            <Badge variant="secondary" className="text-[10px]">敏感信息</Badge>
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          请立即转交队长，关闭后无法再次查看密码。投屏 / 录屏场景请先点 <EyeOff className="inline h-3 w-3" /> 隐藏。
        </p>
        {creds && (
          <div className="space-y-3 mt-2">
            <div className="flex items-center gap-2">
              <Label className="w-16 shrink-0 text-xs">用户名</Label>
              <code className="flex-1 text-sm bg-muted px-2 py-1 rounded">{creds.username}</code>
              <Button size="sm" variant="outline" onClick={() => copy(creds.username, '用户名')}>
                复制
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="w-16 shrink-0 text-xs">密码</Label>
              <code className="flex-1 text-sm bg-muted px-2 py-1 rounded font-mono">
                {reveal ? creds.password : '••••••••'}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? '隐藏密码' : '显示密码'}
                aria-pressed={!reveal}
              >
                {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(creds.password, '密码')}>
                复制
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── edit dialog form state ────────────────────────────────────────────────────

type EditForm = {
  nickname: string;
  primaryPositions: Position[];
  secondaryPositions: Position[];
  currentRank: string;
  peakRank: string;
  willingToCaptain: boolean;
  statement: string;
};

function editFormFromReg(reg: RegistrationWithPlayer): EditForm {
  return {
    nickname: reg.nickname,
    primaryPositions: reg.primaryPositions as Position[],
    secondaryPositions: reg.secondaryPositions as Position[],
    currentRank: reg.currentRank,
    peakRank: reg.peakRank,
    willingToCaptain: reg.willingToCaptain,
    statement: reg.statement ?? '',
  };
}

// ─── add dialog form state ─────────────────────────────────────────────────────

type AddForm = {
  gameId: string;
  nickname: string;
  primaryPositions: Position[];
  secondaryPositions: Position[];
  currentRank: string;
  peakRank: string;
  willingToCaptain: boolean;
  statement: string;
  cost: string;
};

const EMPTY_ADD_FORM: AddForm = {
  gameId: '',
  nickname: '',
  primaryPositions: [],
  secondaryPositions: [],
  currentRank: '',
  peakRank: '',
  willingToCaptain: false,
  statement: '',
  cost: '0',
};

// ─── status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'EXCLUDED'
      ? 'destructive'
      : status === 'ACTIVE'
      ? 'default'
      : 'secondary';
  const label = status === 'EXCLUDED' ? '已排除' : status === 'ACTIVE' ? '有效' : status;
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── main component ───────────────────────────────────────────────────────────

type Props = {
  season: Tournament;
  initialRegistrations: RegistrationWithPlayer[];
};

export function RegistrationsManager({ season, initialRegistrations }: Props) {
  const router = useRouter();
  const rosterEditable = ROSTER_EDITABLE.has(season.status);

  // ── dialog/modal state ────────────────────────────────────────────────────
  const [editingReg, setEditingReg] = useState<RegistrationWithPlayer | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<RegistrationWithPlayer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [creds, setCreds] = useState<{ teamId: string; username: string; password: string } | null>(null);
  const [credsOpen, setCredsOpen] = useState(false);

  // ── per-row in-flight flags ────────────────────────────────────────────────
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  function refresh() {
    router.refresh();
  }

  async function patchReg(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/registrations/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? '操作失败');
    }
  }

  // ── cost inline edit ──────────────────────────────────────────────────────

  async function handleCostSave(reg: RegistrationWithPlayer, raw: string) {
    const cost = Number(raw);
    if (isNaN(cost) || cost < 0) return;
    if (cost === reg.cost) return;
    setBusy(reg.id, true);
    try {
      await patchReg(reg.id, { cost });
      refresh();
      toast.success('费用已更新');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(reg.id, false);
    }
  }

  // ── exclude / restore ─────────────────────────────────────────────────────

  async function handleToggleStatus(reg: RegistrationWithPlayer) {
    const newStatus = reg.status === 'EXCLUDED' ? 'ACTIVE' : 'EXCLUDED';
    setBusy(reg.id, true);
    try {
      await patchReg(reg.id, { status: newStatus });
      refresh();
      toast.success(newStatus === 'EXCLUDED' ? '已排除' : '已恢复');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(reg.id, false);
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/admin/registrations/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '删除失败');
        return;
      }
      setDeleteTarget(null);
      refresh();
      toast.success('已删除');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleteBusy(false);
    }
  }

  // ── appoint captain ───────────────────────────────────────────────────────

  async function handleAppointCaptain(reg: RegistrationWithPlayer) {
    setBusy(reg.id, true);
    try {
      const res = await fetch(`/api/admin/registrations/${reg.id}/appoint-captain`, {
        method: 'POST',
      });
      if (res.status === 201) {
        const data = await res.json().catch(() => ({}));
        setCreds({ teamId: data.teamId, username: data.username, password: data.password });
        setCredsOpen(true);
        refresh();
        toast.success('队长已任命');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '操作失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '任命失败');
    } finally {
      setBusy(reg.id, false);
    }
  }

  // ── revoke captain ────────────────────────────────────────────────────────

  async function handleRevokeCaptain(reg: RegistrationWithPlayer) {
    setBusy(reg.id, true);
    try {
      const res = await fetch(`/api/admin/registrations/${reg.id}/revoke-captain`, {
        method: 'POST',
      });
      if (res.ok) {
        refresh();
        toast.success('队长已撤销');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '操作失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '撤销失败');
    } finally {
      setBusy(reg.id, false);
    }
  }

  // ── edit dialog ───────────────────────────────────────────────────────────

  function openEdit(reg: RegistrationWithPlayer) {
    setEditingReg(reg);
    setEditForm(editFormFromReg(reg));
  }

  async function handleEditSave() {
    if (!editingReg || !editForm) return;
    setEditSaving(true);
    try {
      await patchReg(editingReg.id, {
        nickname: editForm.nickname,
        primaryPositions: editForm.primaryPositions,
        secondaryPositions: editForm.secondaryPositions,
        currentRank: editForm.currentRank,
        peakRank: editForm.peakRank,
        willingToCaptain: editForm.willingToCaptain,
        statement: editForm.statement,
      });
      setEditingReg(null);
      setEditForm(null);
      refresh();
      toast.success('已保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setEditSaving(false);
    }
  }

  // ── add dialog ────────────────────────────────────────────────────────────

  async function handleAddSave() {
    const costNum = Number(addForm.cost);
    if (Number.isNaN(costNum) || costNum < 0) {
      toast.error('费用必须是不小于 0 的数字');
      return;
    }
    setAddSaving(true);
    try {
      const res = await fetch('/api/admin/registrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gameId: addForm.gameId,
          nickname: addForm.nickname,
          primaryPositions: addForm.primaryPositions,
          secondaryPositions: addForm.secondaryPositions,
          currentRank: addForm.currentRank,
          peakRank: addForm.peakRank,
          willingToCaptain: addForm.willingToCaptain,
          statement: addForm.statement || undefined,
          cost: costNum,
        }),
      });
      if (res.status === 201) {
        setAddOpen(false);
        setAddForm(EMPTY_ADD_FORM);
        refresh();
        toast.success('报名已新增');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '操作失败');
      }
    } finally {
      setAddSaving(false);
    }
  }

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <ArenaPanel className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
              PLAYER REGISTRY
            </p>
            <h1 className="mt-2 text-xl font-black text-white">报名管理</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <span>{season.name}</span>
              <Badge variant="outline">{season.status}</Badge>
            </div>
          </div>
          <Button
            onClick={() => { setAddForm(EMPTY_ADD_FORM); setAddOpen(true); }}
            disabled={!rosterEditable}
            title={rosterEditable ? undefined : '选秀启动后名册已锁定'}
          >
            手动新增报名
          </Button>
        </div>
      </ArenaPanel>

      {!rosterEditable && (
        <div className="rounded border border-amber-200/35 bg-amber-200/10 px-3 py-2 text-sm text-amber-100">
          当前赛事状态为 <span className="font-mono">{season.status}</span>，名册已锁定；如需调整请先回退赛事阶段。
        </div>
      )}

      {/* Registrations table */}
      <ArenaPanel className="overflow-x-auto p-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>游戏ID</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>主位置</TableHead>
              <TableHead>副位置</TableHead>
              <TableHead>当前段位</TableHead>
              <TableHead>最高段位</TableHead>
              <TableHead>意愿队长</TableHead>
              <TableHead>费用</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialRegistrations.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  暂无报名记录
                </TableCell>
              </TableRow>
            )}
            {initialRegistrations.map((reg) => (
              <RegRow
                key={reg.id}
                reg={reg}
                busy={busyIds.has(reg.id)}
                rosterEditable={rosterEditable}
                onEdit={() => openEdit(reg)}
                onToggleStatus={() => handleToggleStatus(reg)}
                onDelete={() => setDeleteTarget(reg)}
                onAppointCaptain={() => handleAppointCaptain(reg)}
                onRevokeCaptain={() => handleRevokeCaptain(reg)}
                onCostSave={(v) => handleCostSave(reg, v)}
              />
            ))}
          </TableBody>
        </Table>
      </ArenaPanel>

      {/* Edit dialog */}
      <Dialog
        open={!!editingReg}
        onOpenChange={(o) => { if (!o) { setEditingReg(null); setEditForm(null); } }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑报名 — {editingReg?.player.gameId}</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">昵称</Label>
                <Input
                  value={editForm.nickname}
                  onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                />
              </div>
              <PositionCheckGroup
                label="主位置"
                scope="edit"
                value={editForm.primaryPositions}
                onChange={(v) => setEditForm({ ...editForm, primaryPositions: v })}
                exclude={editForm.secondaryPositions}
              />
              <PositionCheckGroup
                label="副位置"
                scope="edit"
                value={editForm.secondaryPositions}
                onChange={(v) => setEditForm({ ...editForm, secondaryPositions: v })}
                exclude={editForm.primaryPositions}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">当前段位</Label>
                  <Input
                    value={editForm.currentRank}
                    onChange={(e) => setEditForm({ ...editForm, currentRank: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">最高段位</Label>
                  <Input
                    value={editForm.peakRank}
                    onChange={(e) => setEditForm({ ...editForm, peakRank: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-willing"
                  checked={editForm.willingToCaptain}
                  onCheckedChange={(c) =>
                    setEditForm({ ...editForm, willingToCaptain: c === true })
                  }
                />
                <Label htmlFor="edit-willing" className="text-xs cursor-pointer">
                  意愿担任队长
                </Label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">参赛宣言</Label>
                <Input
                  value={editForm.statement}
                  onChange={(e) => setEditForm({ ...editForm, statement: e.target.value })}
                  placeholder="选填"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingReg(null); setEditForm(null); }}>
              取消
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              <LoadingButtonContent loading={editSaving} loadingText="保存中…">
                保存
              </LoadingButtonContent>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>手动新增报名</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">游戏ID</Label>
                <Input
                  value={addForm.gameId}
                  onChange={(e) => setAddForm({ ...addForm, gameId: e.target.value })}
                  placeholder="游戏ID"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">昵称</Label>
                <Input
                  value={addForm.nickname}
                  onChange={(e) => setAddForm({ ...addForm, nickname: e.target.value })}
                  placeholder="昵称"
                />
              </div>
            </div>
            <PositionCheckGroup
              label="主位置"
              scope="add"
              value={addForm.primaryPositions}
              onChange={(v) => setAddForm({ ...addForm, primaryPositions: v })}
              exclude={addForm.secondaryPositions}
            />
            <PositionCheckGroup
              label="副位置"
              scope="add"
              value={addForm.secondaryPositions}
              onChange={(v) => setAddForm({ ...addForm, secondaryPositions: v })}
              exclude={addForm.primaryPositions}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">当前段位</Label>
                <Input
                  value={addForm.currentRank}
                  onChange={(e) => setAddForm({ ...addForm, currentRank: e.target.value })}
                  placeholder="例：白金I"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">最高段位</Label>
                <Input
                  value={addForm.peakRank}
                  onChange={(e) => setAddForm({ ...addForm, peakRank: e.target.value })}
                  placeholder="例：钻石II"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="add-willing"
                  checked={addForm.willingToCaptain}
                  onCheckedChange={(c) =>
                    setAddForm({ ...addForm, willingToCaptain: c === true })
                  }
                />
                <Label htmlFor="add-willing" className="text-xs cursor-pointer">
                  意愿担任队长
                </Label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">费用</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={addForm.cost}
                  onChange={(e) => setAddForm({ ...addForm, cost: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">参赛宣言（选填）</Label>
              <Input
                value={addForm.statement}
                onChange={(e) => setAddForm({ ...addForm, statement: e.target.value })}
                placeholder="选填"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddSave} disabled={addSaving}>
              <LoadingButtonContent loading={addSaving} loadingText="新增中…">
                新增
              </LoadingButtonContent>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除 {deleteTarget?.player.gameId}（{deleteTarget?.nickname}）的报名记录，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteBusy}>
              <LoadingButtonContent loading={deleteBusy} loadingText="删除中…">
                确认删除
              </LoadingButtonContent>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credentials dialog */}
      <CredentialsDialog
        open={credsOpen}
        onClose={() => { setCredsOpen(false); setCreds(null); }}
        creds={creds}
      />
    </div>
  );
}

// ─── row sub-component ────────────────────────────────────────────────────────

type RegRowProps = {
  reg: RegistrationWithPlayer;
  busy: boolean;
  rosterEditable: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onAppointCaptain: () => void;
  onRevokeCaptain: () => void;
  onCostSave: (v: string) => void;
};

function RegRow({
  reg,
  busy,
  rosterEditable,
  onEdit,
  onToggleStatus,
  onDelete,
  onAppointCaptain,
  onRevokeCaptain,
  onCostSave,
}: RegRowProps) {
  const [costVal, setCostVal] = useState(String(reg.cost));

  useEffect(() => {
    setCostVal(String(reg.cost));
  }, [reg.cost]);

  const disabled = busy || !rosterEditable;
  const lockedTitle = rosterEditable ? undefined : '选秀启动后名册已锁定';

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{reg.player.gameId}</TableCell>
      <TableCell>{reg.nickname}</TableCell>
      <TableCell>{posLabels(reg.primaryPositions)}</TableCell>
      <TableCell>{posLabels(reg.secondaryPositions) || '—'}</TableCell>
      <TableCell>{reg.currentRank}</TableCell>
      <TableCell>{reg.peakRank}</TableCell>
      <TableCell>{reg.willingToCaptain ? '✓' : '—'}</TableCell>
      <TableCell>
        <Input
          type="text"
          inputMode="decimal"
          className="w-20 h-7 text-sm"
          value={costVal}
          onChange={(e) => setCostVal(e.target.value)}
          onBlur={() => onCostSave(costVal)}
          disabled={disabled}
          title={lockedTitle}
        />
      </TableCell>
      <TableCell>
        <StatusBadge status={reg.status} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            title={lockedTitle}
            onClick={onEdit}
          >
            编辑
          </Button>
          <Button
            size="sm"
            variant={reg.status === 'EXCLUDED' ? 'default' : 'secondary'}
            disabled={disabled}
            title={lockedTitle}
            onClick={onToggleStatus}
          >
            {reg.status === 'EXCLUDED' ? '恢复' : '排除'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={disabled}
            title={lockedTitle}
            onClick={onDelete}
          >
            删除
          </Button>
          {reg.isCaptain ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              title={lockedTitle}
              onClick={onRevokeCaptain}
            >
              撤销队长
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              title={lockedTitle}
              onClick={onAppointCaptain}
            >
              任命队长
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
