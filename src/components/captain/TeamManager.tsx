'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import NexusButton from '@/components/nexus/NexusButton';
import Field from '@/components/nexus/Field';
import Chip from '@/components/nexus/Chip';
import Readout from '@/components/nexus/Readout';
import { PosPip, type Position } from '@/components/nexus/PosPip';
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

/** Position codes that PosPip natively renders. */
const KNOWN_POSITIONS = new Set<string>(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']);

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
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Page title */}
      <h1
        className="font-display uppercase"
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: 'rgb(var(--ink))',
        }}
      >
        队伍管理
      </h1>

      {/* ── Team info panel ── */}
      <Panel>
        <PanelHead title="TEAM INFO · 队伍信息" />
        <div className="space-y-4 p-4">
          <Field
            id="team-name"
            label="队名"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            maxLength={30}
          />
          <Field
            id="team-slogan"
            label="参赛口号"
            value={sloganVal}
            onChange={(e) => setSloganVal(e.target.value)}
            maxLength={50}
            placeholder="选填 · 最多 50 字"
          />
          <div className="flex justify-end">
            <NexusButton
              variant="primary"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              <LoadingButtonContent loading={saving} loadingText="保存中…">
                保存
              </LoadingButtonContent>
            </NexusButton>
          </div>
        </div>
      </Panel>

      {/* ── Roster panel ── */}
      <Panel>
        <PanelHead title="ROSTER · 队伍阵容" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {roster.map((row, i) => {
            const isKnown = KNOWN_POSITIONS.has(row.position);
            return (
              <div
                key={row.position}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 16px',
                  borderBottom:
                    i < roster.length - 1
                      ? '1px solid rgb(var(--line) / 0.4)'
                      : 'none',
                }}
              >
                {/* Position pip */}
                {isKnown ? (
                  <PosPip
                    pos={row.position as Position}
                    on={!!row.nickname}
                    size={28}
                  />
                ) : (
                  <span
                    style={{
                      display: 'inline-grid',
                      placeItems: 'center',
                      width: 28,
                      height: 28,
                      flexShrink: 0,
                      borderRadius: 'var(--radius-nexus, 4px)',
                      border: '1px solid rgb(var(--line))',
                      fontFamily: 'var(--font-display)',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'rgb(var(--dim))',
                    }}
                  >
                    {row.position[0]}
                  </span>
                )}

                {row.nickname ? (
                  <>
                    {/* Player info */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 13.5,
                            color: 'rgb(var(--ink))',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.nickname}
                        </span>
                        {row.isCaptain && (
                          <Chip variant="ac" style={{ flexShrink: 0 }}>
                            队长
                          </Chip>
                        )}
                      </div>
                      <span
                        className="font-mono text-[11px] truncate"
                        style={{ color: 'rgb(var(--faint))' }}
                      >
                        @{row.gameId}
                      </span>
                    </div>

                    {/* Cost readout */}
                    <div
                      style={{ textAlign: 'right', lineHeight: 1.25, flexShrink: 0 }}
                    >
                      <Readout
                        className="text-[13px] font-semibold"
                        style={{ color: 'rgb(var(--ink))' }}
                      >
                        {row.cost == null ? '—' : formatCost(row.cost)}
                      </Readout>
                      <div
                        className="font-mono text-[10px] uppercase tracking-[0.1em]"
                        style={{ color: 'rgb(var(--faint))' }}
                      >
                        费用
                      </div>
                    </div>
                  </>
                ) : (
                  /* Empty slot */
                  <span
                    className="font-mono text-[12px]"
                    style={{ flex: 1, color: 'rgb(var(--faint))' }}
                  >
                    空缺
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
