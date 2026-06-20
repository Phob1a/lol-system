'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Tournament } from '@prisma/client';
import type { TeamWithRefs } from '@/lib/teams/team-service';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { formatCost } from '@/lib/costs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// ── Nexus components ──────────────────────────────────────────────────────────
import Panel from '@/components/nexus/Panel';
import DTile from '@/components/nexus/DTile';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';
import Readout from '@/components/nexus/Readout';
import NexusButton from '@/components/nexus/NexusButton';
import { SegBudget } from '@/components/nexus/charts/SegBudget';

// ─── props ────────────────────────────────────────────────────────────────────

type Props = {
  season: Tournament;
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
      <DialogContent className="bg-nexus-panel border-nexus-line text-nexus-ink">
        <DialogHeader>
          <DialogTitle className="font-mono text-[13px] uppercase tracking-[0.18em] text-nexus-ink">
            新密码
          </DialogTitle>
        </DialogHeader>
        <p className="font-mono text-[11px] text-nexus-dim">
          请立即转交队长，关闭后无法再次查看。
        </p>
        {password && (
          <div className="flex items-center gap-2 mt-2">
            <Label className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
              密码
            </Label>
            <code className="flex-1 font-mono text-[12px] bg-nexus-panel-2 border border-nexus-line px-2 py-1 text-nexus-accent">
              {password}
            </code>
            <NexusButton size="sm" onClick={() => copy(password)}>
              复制
            </NexusButton>
          </div>
        )}
        <DialogFooter>
          <NexusButton onClick={onClose}>关闭</NexusButton>
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
      <DialogContent className="bg-nexus-panel border-nexus-line text-nexus-ink">
        <DialogHeader>
          <DialogTitle className="font-mono text-[13px] uppercase tracking-[0.18em] text-nexus-ink">
            改名 — {team?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
            新队名
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入新队名"
            className="bg-nexus-bg border-nexus-line text-nexus-ink font-mono text-[12.5px] placeholder:text-nexus-faint focus:border-nexus-accent"
          />
        </div>
        <DialogFooter>
          <NexusButton onClick={onClose} disabled={saving}>
            取消
          </NexusButton>
          <NexusButton
            variant="primary"
            onClick={() => onSave(name)}
            disabled={saving || !name.trim()}
          >
            <LoadingButtonContent loading={saving} loadingText="保存中…">
              保存
            </LoadingButtonContent>
          </NexusButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI tiles ────────────────────────────────────────────────────────────────

function KpiTiles({
  teams,
  teamBudget,
}: {
  teams: TeamWithRefs[];
  teamBudget: number;
}) {
  const avgBudget =
    teams.length > 0
      ? Math.round(teams.reduce((a, t) => a + t.budgetLeft, 0) / teams.length)
      : 0;
  const captainBound = teams.filter((t) => t.captain != null).length;
  const accountReady = teams.filter((t) => t.account != null).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <DTile
        label="队伍"
        value={teams.length}
        sub={`${formatCost(teamBudget)} CR 初始`}
      />
      <DTile
        label="平均预算余"
        value={formatCost(avgBudget)}
        sub="CR"
        className="[&_.font-display]:text-nexus-accent"
      />
      <DTile
        label="队长"
        value={captainBound}
        sub="已绑定"
        className={
          captainBound === teams.length && teams.length > 0
            ? '[&_.font-display]:text-nexus-good'
            : ''
        }
      />
      <DTile
        label="账号"
        value={accountReady}
        sub="已生成"
      />
    </div>
  );
}

// ─── team card (expandable) ───────────────────────────────────────────────────

function TeamCard({
  team,
  teamBudget,
  busy,
  onResetPassword,
  onRename,
}: {
  team: TeamWithRefs;
  teamBudget: number;
  busy: boolean;
  onResetPassword: (t: TeamWithRefs) => void;
  onRename: (t: TeamWithRefs) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Panel glow={expanded}>
      {/* ── header row (always visible) ────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-[18px] text-nexus-ink leading-none">
              {team.name}
            </span>
            {team.captain && (
              <Chip>队长 {team.captain.nickname}</Chip>
            )}
          </div>
          <Readout className="text-[10px] text-nexus-faint mt-1 block">
            {team.account?.username ?? '账号未生成'}
            {' · '}
            预算余 {formatCost(team.budgetLeft)} CR
          </Readout>
        </div>
        <span
          className="font-mono text-[14px] text-nexus-accent flex-shrink-0 transition-transform duration-200 motion-reduce:transition-none"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
          aria-hidden
        >
          ▸
        </span>
      </button>

      {/* ── budget bar (always visible) ────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="flex justify-between items-center mb-1.5">
          <Kicker>预算余额</Kicker>
          <Readout className="text-[11px] text-nexus-accent">
            {formatCost(team.budgetLeft)} / {formatCost(teamBudget)} CR
          </Readout>
        </div>
        <SegBudget
          used={team.budgetLeft}
          total={teamBudget > 0 ? teamBudget : 1}
          segs={22}
        />
      </div>

      {/* ── expanded body ──────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-nexus-line px-4 py-3 space-y-2">
          {/* account info row */}
          <div
            className="grid items-center gap-2 bg-nexus-panel-2 border border-nexus-line px-3 py-2"
            style={{ gridTemplateColumns: 'auto 1fr auto' }}
          >
            <span
              className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-nexus-faint border border-nexus-line px-1.5 py-0.5 whitespace-nowrap"
              aria-label="账号"
            >
              账号
            </span>
            <div className="min-w-0">
              <Readout className="text-[12px] text-nexus-ink block truncate">
                {team.account?.username ?? '—'}
              </Readout>
              <Readout className="text-[10px] text-nexus-faint">
                密码仅生成/重置时显示一次
              </Readout>
            </div>
            <NexusButton
              size="sm"
              disabled={busy}
              onClick={() => onResetPassword(team)}
            >
              重置密码
            </NexusButton>
          </div>

          {/* rename action row */}
          <div
            className="grid items-center gap-2 bg-nexus-panel-2 border border-nexus-line px-3 py-2"
            style={{ gridTemplateColumns: 'auto 1fr auto' }}
          >
            <span
              className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-nexus-faint border border-nexus-line px-1.5 py-0.5 whitespace-nowrap"
              aria-label="队名"
            >
              队名
            </span>
            <Readout className="text-[12px] text-nexus-ink truncate">
              {team.name}
            </Readout>
            <NexusButton
              size="sm"
              disabled={busy}
              onClick={() => onRename(team)}
            >
              改名
            </NexusButton>
          </div>
        </div>
      )}
    </Panel>
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
    <div className="space-y-4">
      {/* ── page header ──────────────────────────────────────────────── */}
      <div>
        <Kicker className="mb-1">TEAMS MANAGEMENT · 队伍管理</Kicker>
        <h1 className="font-display font-bold text-[22px] text-nexus-ink leading-tight">
          {season.name} · 队伍账号
        </h1>
        <p className="font-mono text-[11px] text-nexus-faint mt-1">
          队伍账号在任命队长时生成。用户名长期可见，密码仅在生成/重置时显示一次。
        </p>
      </div>

      {/* ── KPI tiles ────────────────────────────────────────────────── */}
      <KpiTiles teams={initialTeams} teamBudget={season.teamBudget} />

      {/* ── team cards grid ──────────────────────────────────────────── */}
      {initialTeams.length === 0 ? (
        <Panel>
          <div className="py-12 text-center">
            <Readout className="text-nexus-faint text-[12px]">暂无队伍</Readout>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {initialTeams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              teamBudget={season.teamBudget}
              busy={busyIds.has(team.id)}
              onResetPassword={handleResetPassword}
              onRename={openRename}
            />
          ))}
        </div>
      )}

      {/* ── Password dialog ───────────────────────────────────────────── */}
      <PasswordDialog
        open={pwdOpen}
        onClose={() => { setPwdOpen(false); setNewPassword(null); }}
        password={newPassword}
      />

      {/* ── Rename dialog ────────────────────────────────────────────── */}
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
