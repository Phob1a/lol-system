'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

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
    const res = await fetch('/api/captain/team', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameVal, slogan: sloganVal }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
      toast.success('队伍信息已保存');
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '保存失败');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">队伍管理</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">队伍信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">队名</label>
            <Input
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">参赛口号</label>
            <Input
              value={sloganVal}
              onChange={(e) => setSloganVal(e.target.value)}
              maxLength={50}
              placeholder="选填 · 最多 50 字"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">队伍阵容</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {roster.map((row) => (
            <div key={row.position} className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">
                {POS_CHAR[row.position] ?? row.position}
              </span>
              {row.nickname ? (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
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
                    <div className="text-sm font-semibold text-foreground">{row.cost}</div>
                    <div className="text-[10px] text-muted-foreground">费用</div>
                  </div>
                </>
              ) : (
                <span className="flex-1 text-sm text-muted-foreground">空缺</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
