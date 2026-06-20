'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Tournament } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
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
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Chip from '@/components/nexus/Chip';
import NexusButton from '@/components/nexus/NexusButton';
import Kicker from '@/components/nexus/Kicker';
import Readout from '@/components/nexus/Readout';
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
        <NexusButton
          size="sm"
          variant="primary"
          disabled={transitioning}
          onClick={() => handleTransition(tournament.id, 'REGISTRATION')}
        >
          <LoadingButtonContent loading={transitioning} loadingText="开启中…">
            开启报名
          </LoadingButtonContent>
        </NexusButton>
      );
    }
    if (tournament.status === 'REGISTRATION') {
      return (
        <NexusButton
          size="sm"
          variant="primary"
          disabled={transitioning}
          onClick={() => handleTransition(tournament.id, 'ROSTER_LOCKED')}
        >
          <LoadingButtonContent loading={transitioning} loadingText="截止中…">
            截止报名
          </LoadingButtonContent>
        </NexusButton>
      );
    }
    if (tournament.status === 'ROSTER_LOCKED') {
      return (
        <NexusButton
          size="sm"
          disabled={transitioning}
          onClick={() => handleTransition(tournament.id, 'REGISTRATION')}
        >
          <LoadingButtonContent loading={transitioning} loadingText="重开中…">
            重新开启报名
          </LoadingButtonContent>
        </NexusButton>
      );
    }
    return null;
  }

  function statusChipVariant(status: Tournament['status']): 'default' | 'ac' | 'good' {
    if (status === 'ARCHIVED') return 'default';
    if (status === 'SETUP') return 'default';
    return 'ac';
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <Panel>
        <PanelHead title="新建赛事 · CREATE" />
        <form onSubmit={handleCreate} className="p-5 space-y-5 max-w-2xl">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
                赛事名
              </label>
              <Input
                value={name}
                onChange={(e) => {
                  const v = e.target.value;
                  setName(v);
                  if (!tnameEdited) setTcfg((p) => ({ ...p, name: v }));
                }}
                placeholder="例：2025 Spring"
                required
                className="bg-nexus-bg border-nexus-line text-nexus-ink placeholder:text-nexus-faint focus-visible:ring-nexus-accent w-56"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-faint">
                队伍预算
              </label>
              <Input
                type="text"
                inputMode="decimal"
                value={teamBudget}
                onChange={(e) => setTeamBudget(e.target.value)}
                placeholder="预算"
                required
                className="bg-nexus-bg border-nexus-line text-nexus-ink placeholder:text-nexus-faint focus-visible:ring-nexus-accent w-32"
              />
            </div>
          </div>

          {/* 赛事设置 */}
          <div className="rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 p-4 space-y-3">
            <Kicker>赛事设置 · TOURNAMENT CONFIG</Kicker>
            <TournamentConfigForm
              value={tcfg}
              onChange={setTcfg}
              onValidityChange={setTcfgValid}
              showNameField
              onNameUserEdit={() => setTnameEdited(true)}
            />
          </div>

          <NexusButton
            variant="primary"
            type="submit"
            disabled={submitting || !tcfgValid || !name.trim() || !teamBudget}
          >
            <LoadingButtonContent loading={submitting} loadingText="创建中…">
              新建赛事
            </LoadingButtonContent>
          </NexusButton>
        </form>
      </Panel>

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
      <Panel>
        <PanelHead
          title="赛事列表 · TOURNAMENTS"
          actions={
            <Readout className="text-[10px] text-nexus-faint">
              {initialTournaments.length} 条记录
            </Readout>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['赛事名', '状态', '预算', '创建时间', '操作'].map((h) => (
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
              {initialTournaments.map((t) => (
                <tr key={t.id} className="hover:bg-nexus-panel-2/60 transition-colors">
                  <td className="px-4 py-3 border-b border-nexus-line/40 font-body text-[13px] text-nexus-ink">
                    {t.name}
                  </td>
                  <td className="px-4 py-3 border-b border-nexus-line/40">
                    <Chip variant={statusChipVariant(t.status)}>{t.status}</Chip>
                  </td>
                  <td className="px-4 py-3 border-b border-nexus-line/40">
                    <Readout className="text-[12px] text-nexus-accent">{t.teamBudget}</Readout>
                  </td>
                  <td className="px-4 py-3 border-b border-nexus-line/40">
                    <Readout className="text-[11px] text-nexus-faint">
                      {t.createdAt.toLocaleString('zh-CN')}
                    </Readout>
                  </td>
                  <td className="px-4 py-3 border-b border-nexus-line/40">
                    {t.status !== 'ARCHIVED' ? transitionButton(t) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
