'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Position } from '@prisma/client';
import type { RegistrationRef } from '@/lib/teams/preview';
import { POSITIONS } from '@/lib/players/schema';
import { POSITION_LABEL } from '@/components/players/positions';
import { TcPos } from '@/components/tactical/TcPos';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: () => void;
  player: RegistrationRef;
  emptySlots: Position[];
  budgetLeft: number;
  expectedSeq: number;
  onBehalfOf?: string;
};

export function PickAction({
  open,
  onOpenChange,
  onPicked,
  player,
  emptySlots,
  budgetLeft,
  expectedSeq,
  onBehalfOf,
}: Props) {
  const [position, setPosition] = useState<Position | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const insufficientBudget = budgetLeft < player.cost;
  const noSlots = emptySlots.length === 0;

  async function submit() {
    if (!position) {
      toast.error('请选择位置');
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/draft/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        registrationId: player.id,
        position,
        expectedSeq,
        ...(onBehalfOf && { onBehalfOf }),
      }),
    });
    setSubmitting(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? '出手失败');
      if (body.code === 'STALE_SEQ') onOpenChange(false);
      return;
    }
    toast.success(`已选 ${player.nickname}`);
    onPicked();
    onOpenChange(false);
  }

  if (!open) return null;

  return (
    <div
      onClick={() => onOpenChange(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(7,8,12,0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tc-card"
        style={{ width: 520, maxWidth: '100%', padding: 24, background: 'var(--tc-bg-1)', position: 'relative' }}
      >
        <span className="corner tl" style={{ borderColor: 'var(--tc-cyan)' }} />
        <span className="corner tr" style={{ borderColor: 'var(--tc-cyan)' }} />
        <span className="corner bl" style={{ borderColor: 'var(--tc-cyan)' }} />
        <span className="corner br" style={{ borderColor: 'var(--tc-cyan)' }} />

        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 4, height: 28, background: 'var(--tc-cyan)', boxShadow: '0 0 12px var(--tc-cyan)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 18 }}>
              PICK<span style={{ color: 'var(--tc-cyan)' }}>{'//'}</span>{player.nickname.toUpperCase()}
            </div>
            <div className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
              @{player.gameId} · cost {player.cost} CR · budget {budgetLeft} CR
            </div>
          </div>
        </header>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {player.primaryPositions.map((p) => (
            <span key={`p-${p}`} className="tc-chip tc-chip-on" style={{ fontSize: 10 }}>
              ◆ {p} <span style={{ marginLeft: 4, opacity: 0.65 }}>{POSITION_LABEL[p]}</span>
            </span>
          ))}
          {player.secondaryPositions.map((p) => (
            <span key={`s-${p}`} className="tc-chip" style={{ fontSize: 10 }}>
              ○ {p} <span style={{ marginLeft: 4, opacity: 0.65 }}>{POSITION_LABEL[p]}</span>
            </span>
          ))}
        </div>

        {insufficientBudget && (
          <div
            style={{
              padding: '8px 10px',
              marginBottom: 12,
              background: 'rgba(255,61,92,0.08)',
              borderLeft: '3px solid var(--tc-red)',
              fontFamily: 'var(--tc-font-mono)',
              fontSize: 11,
              color: 'var(--tc-red)',
            }}
          >
            ⚠ 预算不足：还差 {player.cost - budgetLeft} CR
          </div>
        )}
        {noSlots && (
          <div
            style={{
              padding: '8px 10px',
              marginBottom: 12,
              background: 'rgba(255,61,92,0.08)',
              borderLeft: '3px solid var(--tc-red)',
              fontFamily: 'var(--tc-font-mono)',
              fontSize: 11,
              color: 'var(--tc-red)',
            }}
          >
            ⚠ 该战队已无空位
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <span className="tc-label">ASSIGN POSITION（不校验熟练位）</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 6 }}>
            {POSITIONS.map((pos) => {
              const empty = emptySlots.includes(pos);
              const active = position === pos;
              const accent = active ? 'var(--tc-cyan)' : 'var(--tc-line2)';
              return (
                <button
                  key={pos}
                  type="button"
                  disabled={!empty || insufficientBudget}
                  onClick={() => setPosition(pos)}
                  style={{
                    padding: '10px 6px',
                    background: active ? 'rgba(0,229,255,0.10)' : 'var(--tc-bg-0)',
                    border: `1px solid ${accent}`,
                    boxShadow: active ? '0 0 12px rgba(0,229,255,0.35)' : 'none',
                    color: active ? 'var(--tc-cyan)' : 'var(--tc-text)',
                    cursor: empty && !insufficientBudget ? 'pointer' : 'not-allowed',
                    opacity: empty ? 1 : 0.35,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    fontFamily: 'var(--tc-font-display)',
                  }}
                >
                  <TcPos pos={pos} size={20} on={active} dim={!empty} />
                  <span style={{ fontSize: 10, letterSpacing: 1 }}>{POSITION_LABEL[pos]}</span>
                  {!empty && (
                    <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-faint)' }}>OCCUPIED</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="tc-divider" />

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" className="tc-btn" onClick={() => onOpenChange(false)}>
            CANCEL
          </button>
          <button
            type="button"
            className="tc-btn tc-btn-primary"
            onClick={submit}
            disabled={submitting || !position || insufficientBudget || noSlots}
            style={{ minWidth: 160, justifyContent: 'center' }}
          >
            {submitting ? '▸ SUBMITTING…' : '▸ CONFIRM PICK'}
          </button>
        </footer>
      </div>
    </div>
  );
}
