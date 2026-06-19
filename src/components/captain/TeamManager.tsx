'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { ArenaPanel } from '@/components/public-arena';
import { formatCost } from '@/lib/costs';

export type RosterRow = {
  position: string;
  nickname: string | null;
  gameId: string | null;
  cost: number | null;
  isCaptain: boolean;
};

type Props = {
  name: string;
  slogan: string | null;
  roster: RosterRow[];
};

/** Chinese single-character marker for a position value. */
const POS_CHAR: Record<string, string> = {
  TOP: '上',
  JUNGLE: '野',
  MID: '中',
  ADC: '射',
  SUPPORT: '辅',
};

export function TeamManager({ name, slogan, roster }: Props) {
  const router = useRouter();
  const [nameVal, setNameVal] = useState(name);
  const [sloganVal, setSloganVal] = useState(slogan ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = nameVal !== name || sloganVal !== (slogan ?? '');

  async function handleSave() {
    if (nameVal.trim() === '') {
      toast.error('队名必填');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/captain/team', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: nameVal, slogan: sloganVal }),
      });
      if (res.ok) {
        router.refresh();
        toast.success('队伍信息已保存');
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? '保存失败');
      }
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
          TEAM PROFILE
        </p>
        <h1 className="mt-2 text-2xl font-black text-white">队伍管理</h1>
      </div>

      <ArenaPanel title="队伍信息" eyebrow="IDENTITY" className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="team-name" className="text-xs text-muted-foreground">队名</label>
            <Input
              id="team-name"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="team-slogan" className="text-xs text-muted-foreground">参赛口号</label>
            <Input
              id="team-slogan"
              value={sloganVal}
              onChange={(e) => setSloganVal(e.target.value)}
              maxLength={50}
              placeholder="选填 · 最多 50 字"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !dirty}>
              <LoadingButtonContent loading={saving} loadingText="保存中…">
                保存
              </LoadingButtonContent>
            </Button>
          </div>
      </ArenaPanel>

      <ArenaPanel title="队伍阵容" eyebrow="ROSTER">
        <div className="divide-y divide-cyan-200/15">
          {roster.map((row) => (
            <div key={row.position} className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-200/25 bg-cyan-200/[0.12] text-sm font-bold text-cyan-50">
                {POS_CHAR[row.position] ?? row.position}
              </span>
              {row.nickname ? (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-white">
                        {row.nickname}
                      </span>
                      {row.isCaptain && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          队长
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">@{row.gameId}</span>
                  </div>
                  <div className="text-right leading-tight">
                    <div className="text-sm font-semibold text-white">
                      {row.cost == null ? '—' : formatCost(row.cost)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">费用</div>
                  </div>
                </>
              ) : (
                <span className="flex-1 text-sm text-muted-foreground">空缺</span>
              )}
            </div>
          ))}
        </div>
      </ArenaPanel>
    </div>
  );
}
