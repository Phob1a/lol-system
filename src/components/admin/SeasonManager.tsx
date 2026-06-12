'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Season } from '@prisma/client';
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

type Props = { initialSeasons: Season[] };

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

export function SeasonManager({ initialSeasons }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [teamBudget, setTeamBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [tcfg, setTcfg] = useState<TournamentConfigValue>(DEFAULT_TCFG);
  const [tcfgValid, setTcfgValid] = useState(false);
  const [tnameEdited, setTnameEdited] = useState(false);

  const activeSeason = initialSeasons.find((s) => s.status !== 'ARCHIVED') ?? null;

  async function doCreate() {
    setSubmitting(true);
    const res = await fetch('/api/seasons', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        teamBudget: Number(teamBudget),
        tournament: {
          name: tcfg.name || undefined,
          kind: tcfg.kind,
          config: tcfg.config,
        },
      }),
    });
    setSubmitting(false);
    if (res.status === 201) {
      setName('');
      setTeamBudget('');
      setTcfg(DEFAULT_TCFG);
      setTnameEdited(false);
      router.refresh();
      toast.success('赛季已创建');
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '创建失败');
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (activeSeason) {
      setConfirmOpen(true);
    } else {
      doCreate();
    }
  }

  async function handleTransition(id: string, to: string) {
    setTransitioningId(id);
    try {
      const res = await fetch(`/api/seasons/${id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      if (res.ok) {
        router.refresh();
        toast.success('状态已更新');
      } else {
        const body = await res.json().catch(() => ({}));
        if (res.status >= 500) {
          console.error('season transition failed', body);
        }
        toast.error(body.error ?? '操作失败');
      }
    } finally {
      setTransitioningId(null);
    }
  }

  function transitionButton(season: Season) {
    const transitioning = transitioningId === season.id;
    if (season.status === 'SETUP') {
      return (
        <Button
          size="sm"
          disabled={transitioning}
          onClick={() => handleTransition(season.id, 'REGISTRATION')}
        >
          <LoadingButtonContent loading={transitioning} loadingText="开启中…">
            开启报名
          </LoadingButtonContent>
        </Button>
      );
    }
    if (season.status === 'REGISTRATION') {
      return (
        <Button
          size="sm"
          disabled={transitioning}
          onClick={() => handleTransition(season.id, 'ROSTER_LOCKED')}
        >
          <LoadingButtonContent loading={transitioning} loadingText="截止中…">
            截止报名
          </LoadingButtonContent>
        </Button>
      );
    }
    if (season.status === 'ROSTER_LOCKED') {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={transitioning}
          onClick={() => handleTransition(season.id, 'REGISTRATION')}
        >
          <LoadingButtonContent loading={transitioning} loadingText="重开中…">
            重新开启报名
          </LoadingButtonContent>
        </Button>
      );
    }
    return null;
  }

  function statusVariant(status: Season['status']): 'default' | 'secondary' | 'outline' {
    if (status === 'ARCHIVED') return 'secondary';
    if (status === 'SETUP') return 'outline';
    return 'default';
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">赛季管理</h1>

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-4 max-w-xl">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">赛季名</label>
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
            新建赛季
          </LoadingButtonContent>
        </Button>
      </form>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>归档当前赛季</AlertDialogTitle>
            <AlertDialogDescription>
              创建新赛季会归档当前赛季「{activeSeason?.name}」，确定继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); doCreate(); }}>
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Seasons table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>赛季名</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>预算</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initialSeasons.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.name}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
              </TableCell>
              <TableCell>{s.teamBudget}</TableCell>
              <TableCell>{s.createdAt.toLocaleString('zh-CN')}</TableCell>
              <TableCell>{s.status !== 'ARCHIVED' ? transitionButton(s) : null}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
