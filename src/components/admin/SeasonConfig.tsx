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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { BUDGET_EDITABLE_STATUSES } from '@/lib/tournament/tournament-service';

type Props = { season: Tournament | null };

export function SeasonConfig({ season }: Props) {
  const router = useRouter();
  const [teamBudget, setTeamBudget] = useState(
    season ? String(season.teamBudget) : '',
  );
  const [saving, setSaving] = useState(false);

  if (!season) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">系统配置</h1>
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            当前没有进行中的赛事。请先在「赛事管理」中创建赛事。
          </CardContent>
        </Card>
      </div>
    );
  }

  const editable = BUDGET_EDITABLE_STATUSES.includes(season.status);
  const dirty = teamBudget !== String(season.teamBudget);

  async function handleSave() {
    if (!season) return;
    const value = Number(teamBudget);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('预算必须大于 0');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/tournament/${season.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamBudget: value }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
      toast.success('队伍预算已更新');
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '更新失败');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">系统配置</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            当前赛事
            <Badge variant="outline">{season.name}</Badge>
            <Badge variant="secondary">{season.status}</Badge>
          </CardTitle>
          <CardDescription>
            队伍总费用是本赛事每支队伍的初始预算。选秀开始后该值会被锁定，因为各队的剩余预算已基于它计算。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">队伍总费用</label>
            <div className="flex items-end gap-3">
              <Input
                type="text"
                inputMode="decimal"
                className="w-48"
                value={teamBudget}
                onChange={(e) => setTeamBudget(e.target.value)}
                disabled={!editable || saving}
              />
              <Button
                onClick={handleSave}
                disabled={!editable || saving || !dirty}
              >
                <LoadingButtonContent loading={saving} loadingText="保存中…">
                  保存
                </LoadingButtonContent>
              </Button>
            </div>
          </div>
          {!editable && (
            <p className="text-xs text-amber-600">
              选秀已开始（{season.status}），队伍预算已锁定，无法修改。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
