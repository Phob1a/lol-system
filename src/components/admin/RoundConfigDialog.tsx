'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import type { Position, RoundMode } from '@prisma/client';
import type { DraftSnapshot, RegistrationRef } from '@/lib/draft/types';
import { POSITIONS } from '@/lib/players/schema';
import { POSITION_LABEL } from '@/components/players/positions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
  snapshot: DraftSnapshot;
  /** Pool of unpicked, eligible registrations for MANUAL mode. */
  pool: RegistrationRef[];
  /** Whether REVERSE_LAST is allowed (i.e. there is a previous round). */
  canReverse: boolean;
  nextRoundNo: number;
};

export function RoundConfigDialog({
  open,
  onOpenChange,
  onSubmitted,
  snapshot,
  pool,
  canReverse,
  nextRoundNo,
}: Props) {
  const [mode, setMode] = useState<RoundMode>('ADMIN_ORDER');
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<string[]>(snapshot.teams.map((t) => t.captainId));
  const [assignments, setAssignments] = useState<
    Record<string, { registrationId: string; position: Position | '' }>
  >({});

  useEffect(() => {
    if (open) {
      setMode(canReverse ? 'ADMIN_ORDER' : 'ADMIN_ORDER');
      setOrder(snapshot.teams.map((t) => t.captainId));
      const init: Record<string, { registrationId: string; position: Position | '' }> = {};
      for (const t of snapshot.teams) {
        init[t.captainId] = { registrationId: '', position: '' };
      }
      setAssignments(init);
    }
  }, [open, canReverse, snapshot.teams]);

  // Empty slots per captain (used to constrain MANUAL position select).
  const emptySlotsByCaptain = useMemo(() => {
    const m = new Map<string, Position[]>();
    for (const t of snapshot.teams) {
      m.set(
        t.captainId,
        t.slots.filter((s) => s.registration === null).map((s) => s.position),
      );
    }
    return m;
  }, [snapshot.teams]);

  // Budget per captain — used in MANUAL to surface "insufficient budget" early.
  const budgetByCaptain = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of snapshot.teams) m.set(t.captainId, t.budgetLeft);
    return m;
  }, [snapshot.teams]);

  function moveOrder(idx: number, dir: -1 | 1) {
    setOrder((cur) => {
      const next = [...cur];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function captainName(captainId: string): string {
    return snapshot.teams.find((t) => t.captainId === captainId)?.captainNickname ?? captainId;
  }

  async function submit() {
    if (mode === 'MANUAL') {
      // Validate: every captain has registrationId + position
      const issues: string[] = [];
      const usedPlayers = new Set<string>();
      for (const t of snapshot.teams) {
        const a = assignments[t.captainId];
        if (!a?.registrationId) issues.push(`${t.captainNickname}: 未选择选手`);
        else if (usedPlayers.has(a.registrationId)) issues.push(`${t.captainNickname}: 选手与他队冲突`);
        else usedPlayers.add(a.registrationId);
        if (!a?.position) issues.push(`${t.captainNickname}: 未选择位置`);
      }
      if (issues.length > 0) {
        toast.error(issues[0]);
        return;
      }
    } else if (mode === 'ADMIN_ORDER') {
      if (new Set(order).size !== order.length || order.length !== snapshot.teams.length) {
        toast.error('顺序无效');
        return;
      }
    }

    setSubmitting(true);
    const body: {
      mode: RoundMode;
      adminProvidedOrder?: string[];
      manualAssignments?: { captainId: string; registrationId: string; position: Position }[];
    } = { mode };
    if (mode === 'ADMIN_ORDER') body.adminProvidedOrder = order;
    if (mode === 'MANUAL') {
      body.manualAssignments = snapshot.teams.map((t) => ({
        captainId: t.captainId,
        registrationId: assignments[t.captainId].registrationId,
        position: assignments[t.captainId].position as Position,
      }));
    }

    const res = await fetch('/api/draft/round/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? '启动轮次失败');
      return;
    }
    toast.success(mode === 'MANUAL' ? '本轮已完成（管理员代选）' : `第 ${nextRoundNo} 轮已开始`);
    onSubmitted();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>启动第 {nextRoundNo} 轮</DialogTitle>
          <DialogDescription>选择本轮的选人模式与配置。顺序在轮启动时冻结，撤销/出手不会改变本轮顺序。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>模式</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as RoundMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN_ORDER">管理员定序 — 管理员决定顺序，队长依次出手</SelectItem>
                <SelectItem value="REVERSE_LAST" disabled={!canReverse}>
                  上轮逆序{!canReverse && '（首轮不可用）'}
                </SelectItem>
                <SelectItem value="BUDGET_DESC">按剩余预算降序（同费随机）</SelectItem>
                <SelectItem value="MANUAL">管理员指派 — 直接为每队指定选手</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'ADMIN_ORDER' && (
            <div className="space-y-2">
              <Label>顺序（拖动按钮调整）</Label>
              <Card>
                <CardContent className="divide-y p-0">
                  {order.map((cid, i) => (
                    <div key={cid} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-6 text-xs font-mono text-muted-foreground">#{i + 1}</span>
                      <span className="flex-1">{captainName(cid)}</span>
                      <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => moveOrder(i, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={i === order.length - 1} onClick={() => moveOrder(i, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {(mode === 'REVERSE_LAST' || mode === 'BUDGET_DESC') && (
            <Card className="bg-muted/30">
              <CardContent className="py-3 text-sm text-muted-foreground">
                {mode === 'REVERSE_LAST' ? '本轮顺序为上一轮顺序的逆序（启动时由服务端计算）。' : '本轮顺序按当前剩余预算降序排列；同费用将由 RNG 决定（启动时冻结）。'}
              </CardContent>
            </Card>
          )}

          {mode === 'MANUAL' && (
            <div className="space-y-2">
              <Label>每队指派</Label>
              <Card>
                <CardContent className="divide-y p-0">
                  {snapshot.teams.map((t) => {
                    const a = assignments[t.captainId] ?? { registrationId: '', position: '' };
                    const empties = emptySlotsByCaptain.get(t.captainId) ?? [];
                    const budget = budgetByCaptain.get(t.captainId) ?? 0;
                    const eligiblePool = pool.filter((p) => p.cost <= budget);
                    return (
                      <div key={t.captainId} className="grid grid-cols-1 gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_2fr_1fr]">
                        <div className="flex flex-col">
                          <span className="font-medium">{t.captainNickname}</span>
                          <span className="text-[10px] text-muted-foreground">预算 {budget}</span>
                        </div>
                        <Select
                          value={a.registrationId}
                          onValueChange={(v) => setAssignments((cur) => ({ ...cur, [t.captainId]: { ...a, registrationId: v } }))}
                        >
                          <SelectTrigger><SelectValue placeholder="选择选手" /></SelectTrigger>
                          <SelectContent>
                            {eligiblePool.length === 0 && (
                              <div className="p-2 text-xs text-muted-foreground">预算内无可选选手</div>
                            )}
                            {eligiblePool.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nickname} <span className="ml-2 font-mono text-xs text-muted-foreground">{p.gameId} · {p.cost}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={a.position}
                          onValueChange={(v) => setAssignments((cur) => ({ ...cur, [t.captainId]: { ...a, position: v as Position } }))}
                        >
                          <SelectTrigger><SelectValue placeholder="位置" /></SelectTrigger>
                          <SelectContent>
                            {POSITIONS.map((pos) => (
                              <SelectItem key={pos} value={pos} disabled={!empties.includes(pos)}>
                                {POSITION_LABEL[pos]}{!empties.includes(pos) && ' (已占)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit} disabled={submitting}>
            <LoadingButtonContent loading={submitting} loadingText="启动中…">
              启动
            </LoadingButtonContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
