'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Season } from '@prisma/client';
import type { TeamWithRefs } from '@/lib/teams/team-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
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

// ─── props ────────────────────────────────────────────────────────────────────

type Props = {
  season: Season;
  initialTeams: TeamWithRefs[];
};

// ─── password dialog ──────────────────────────────────────────────────────────

function PasswordDialog({
  open,
  onClose,
  password,
}: {
  open: boolean;
  onClose: () => void;
  password: string | null;
}) {
  function copy(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('已复制'))
      .catch(() => toast.error('复制失败'));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新密码</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          请立即转交队长，关闭后无法再次查看。
        </p>
        {password && (
          <div className="flex items-center gap-2 mt-2">
            <Label className="w-12 shrink-0 text-xs">密码</Label>
            <code className="flex-1 text-sm bg-muted px-2 py-1 rounded">{password}</code>
            <Button size="sm" variant="outline" onClick={() => copy(password)}>
              复制
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── rename dialog ────────────────────────────────────────────────────────────

function RenameDialog({
  open,
  onClose,
  team,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamWithRefs | null;
  onSave: (name: string) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');

  // Reset the input when the dialog opens for a new team
  function handleOpenChange(o: boolean) {
    if (o && team) setName(team.name);
    if (!o) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>改名 — {team?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">新队名</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入新队名"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => onSave(name)} disabled={saving || !name.trim()}>
            <LoadingButtonContent loading={saving} loadingText="保存中…">
              保存
            </LoadingButtonContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function TeamsManager({ season, initialTeams }: Props) {
  const router = useRouter();

  // ── password reset dialog state ───────────────────────────────────────────
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  // ── rename dialog state ───────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<TeamWithRefs | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);

  // ── per-row in-flight flags ───────────────────────────────────────────────
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // ── reset password ────────────────────────────────────────────────────────

  async function handleResetPassword(team: TeamWithRefs) {
    setBusy(team.id, true);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}/reset-password`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setNewPassword(data.password ?? null);
        setPwdOpen(true);
        router.refresh();
        toast.success('密码已重置');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '密码重置失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '密码重置失败');
    } finally {
      setBusy(team.id, false);
    }
  }

  // ── rename ────────────────────────────────────────────────────────────────

  function openRename(team: TeamWithRefs) {
    setRenameTarget(team);
  }

  async function handleRenameSave(name: string) {
    if (!renameTarget) return;
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/teams/${renameTarget.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setRenameTarget(null);
        router.refresh();
        toast.success('队名已更新');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '改名失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '改名失败');
    } finally {
      setRenameSaving(false);
    }
  }

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">队伍账号</h1>
        <p className="text-sm text-muted-foreground">
          {season.name} · 队伍账号在任命队长时生成。用户名长期可见，密码仅在生成/重置时显示一次。
        </p>
      </div>

      {/* Teams table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>队名</TableHead>
            <TableHead>队长</TableHead>
            <TableHead>账号</TableHead>
            <TableHead>预算</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initialTeams.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                暂无队伍
              </TableCell>
            </TableRow>
          )}
          {initialTeams.map((team) => (
            <TableRow key={team.id}>
              <TableCell>{team.name}</TableCell>
              <TableCell>{team.captain?.nickname ?? '—'}</TableCell>
              <TableCell className="font-mono text-sm">
                {team.account?.username ?? '—'}
              </TableCell>
              <TableCell>{team.budgetLeft}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyIds.has(team.id)}
                    onClick={() => handleResetPassword(team)}
                  >
                    重置密码
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyIds.has(team.id)}
                    onClick={() => openRename(team)}
                  >
                    改名
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Password dialog */}
      <PasswordDialog
        open={pwdOpen}
        onClose={() => { setPwdOpen(false); setNewPassword(null); }}
        password={newPassword}
      />

      {/* Rename dialog */}
      <RenameDialog
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        team={renameTarget}
        onSave={handleRenameSave}
        saving={renameSaving}
      />
    </div>
  );
}
