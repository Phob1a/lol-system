'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Tournament } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  TournamentConfigForm,
  type TournamentConfigValue,
} from './tournament/TournamentConfigForm';

type Props = { initialTournaments: Tournament[] };

const DEFAULT_TCFG: TournamentConfigValue = {
  name: '',
  kind: '正赛',
  config: {
    template: 'group-knockout',
    groupCount: 2,
    teamsPerGroup: 4,
    advancingPerGroup: 2,
    groupBestOf: 1,
    knockoutBestOf: { SF: 3, FINAL: 5 },
  },
};

export function TournamentManager({ initialTournaments }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [teamBudget, setTeamBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [tcfg, setTcfg] = useState<TournamentConfigValue>(DEFAULT_TCFG);
  const [tcfgValid, setTcfgValid] = useState(false);
  const [tnameEdited, setTnameEdited] = useState(false);

  const activeTournament = initialTournaments.find((t) => t.status !== 'ARCHIVED') ?? null;

  async function doCreate() {
    setSubmitting(true);
    const res = await fetch('/api/tournament', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        teamBudget: Number(teamBudget),
        kind: tcfg.kind,
        config: tcfg.config,
      }),
    });
    setSubmitting(false);
    if (res.status === 201) {
      setName('');
      setTeamBudget('');
      setTcfg(DEFAULT_TCFG);
      setTnameEdited(false);
      router.refresh();
      toast.success('赛事已创建');
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '创建失败');
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (activeTournament) {
      setConfirmOpen(true);
    } else {
      void doCreate();
    }
  }

  async function handleTransition(id: string, next: string) {
    setTransitioningId(id);
    try {
      const res = await fetch(`/api/tournament/${id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ next }),
      });
      if (res.ok) {
        router.refresh();
        toast.success('状态已更新');
      } else {
        const body = await res.json().catch(() => ({}));
        if (res.status >= 500) {
          console.error('tournament transition failed', body);
        }
        toast.error(body.error ?? '操作失败');
      }
    } finally {
      setTransitioningId(null);
    }
  }

  function transitionButton(tournament: Tournament) {
    const transitioning = transitioningId === tournament.id;
    if (tournament.status === 'SETUP') {
      return (
        <Button
          size="sm"
          disabled={transitioning}
          onClick={() => handleTransition(tournament.id, 'REGISTRATION')}
        >
          <LoadingButtonContent loading={transitioning} loadingText="开启中…">
            开启报名
          </LoadingButtonContent>
        </Button>
      );
    }
    if (tournament.status === 'REGISTRATION') {
      return (
        <Button
          size="sm"
          disabled={transitioning}
          onClick={() => handleTransition(tournament.id, 'ROSTER_LOCKED')}
        >
          <LoadingButtonContent loading={transitioning} loadingText="截止中…">
            截止报名
          </LoadingButtonContent>
        </Button>
      );
    }
    if (tournament.status === 'ROSTER_LOCKED') {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={transitioning}
          onClick={() => handleTransition(tournament.id, 'REGISTRATION')}
        >
          <LoadingButtonContent loading={transitioning} loadingText="重开中…">
            重新开启报名
          </LoadingButtonContent>
        </Button>
      );
    }
    return null;
  }

  function statusVariant(status: Tournament['status']): 'default' | 'secondary' | 'outline' {
    if (status === 'ARCHIVED') return 'secondary';
    if (status === 'SETUP') return 'outline';
    return 'default';
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">赛事管理</h1>

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-4 max-w-xl">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">赛事名</label>
            <Input
              value={name}
              onChange={(e) => {
                const v = e.target.value;
                setName(v);
                if (!tnameEdited) setTcfg((p) => ({ ...p, name: v }));
              }}
              placeholder="例：2025 Spring"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">队伍预算</label>
            <Input
              type="text"
              inputMode="decimal"
              value={teamBudget}
              onChange={(e) => setTeamBudget(e.target.value)}
              placeholder="预算"
              required
            />
          </div>
        </div>

        {/* 赛事设置 */}
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm font-medium">赛事设置</p>
          <TournamentConfigForm
            value={tcfg}
            onChange={setTcfg}
            onValidityChange={setTcfgValid}
            showNameField
            onNameUserEdit={() => setTnameEdited(true)}
          />
        </div>

        <Button type="submit" disabled={submitting || !tcfgValid || !name.trim() || !teamBudget}>
          <LoadingButtonContent loading={submitting} loadingText="创建中…">
            新建赛事
          </LoadingButtonContent>
        </Button>
      </form>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>归档当前赛事</AlertDialogTitle>
            <AlertDialogDescription>
              创建新赛事会归档当前赛事「{activeTournament?.name}」，确定继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); void doCreate(); }}>
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tournaments table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>赛事名</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>预算</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initialTournaments.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.name}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
              </TableCell>
              <TableCell>{t.teamBudget}</TableCell>
              <TableCell>{t.createdAt.toLocaleString('zh-CN')}</TableCell>
              <TableCell>{t.status !== 'ARCHIVED' ? transitionButton(t) : null}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
