'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TOTAL_ROUNDS } from '@/lib/draft/engine';

type Props = {
  teamBudget: number;
  draftLocked: boolean;
};

export function ConfigForm({ teamBudget, draftLocked }: Props) {
  const router = useRouter();
  const [budget, setBudget] = useState<number>(teamBudget);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (draftLocked) return;
    setSaving(true);
    const res = await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamBudget: budget }),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? '保存失败');
      return;
    }
    toast.success('配置已保存');
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="tc-board"
      style={{ minHeight: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 30, background: 'var(--tc-amber)', boxShadow: '0 0 12px var(--tc-amber)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              SESSION<span style={{ color: 'var(--tc-amber)' }}>{"//"}</span>CONFIG
            </div>
            <div className="tc-label">LOCKS BEFORE DRAFT START</div>
          </div>
        </div>
        <span
          className="tc-chip"
          style={{
            background: draftLocked ? 'rgba(255,178,61,0.14)' : 'rgba(61,255,156,0.10)',
            borderColor: draftLocked ? 'var(--tc-amber)' : 'var(--tc-green)',
            color: draftLocked ? 'var(--tc-amber)' : 'var(--tc-green)',
          }}
        >
          {draftLocked ? '◇ LOCKED · DRAFT IN PROGRESS' : '◇ EDITABLE'}
        </span>
      </header>

      <div className="tc-divider" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="ECONOMY">
          <NumField
            label="TEAM BUDGET (CR)"
            value={budget}
            disabled={draftLocked}
            onChange={(n) => setBudget(n)}
            hint="每队初始预算；选秀启动后锁定"
          />
        </Card>

        <Card title="STRUCTURE">
          <div>
            <span className="tc-label">ROUNDS PER DRAFT</span>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <span className="tc-chip tc-chip-on" style={{ fontSize: 13, padding: '6px 14px' }}>
                {TOTAL_ROUNDS}
              </span>
              <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
                fixed · captain + {TOTAL_ROUNDS} picks = 5 slots
              </span>
            </div>
          </div>
          <div>
            <span className="tc-label">SLOTS PER TEAM</span>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'].map((p) => (
                <span key={p} className="tc-chip" style={{ fontSize: 10, padding: '4px 10px' }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          className="tc-btn"
          disabled={saving || draftLocked}
          onClick={() => setBudget(teamBudget)}
        >
          DISCARD
        </button>
        <button type="submit" className="tc-btn tc-btn-primary" disabled={draftLocked || saving}>
          {saving ? '▸ SAVING…' : '▸ SAVE'}
        </button>
      </footer>
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tc-card" style={{ padding: 16, position: 'relative' }}>
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />
      <div className="tc-h3" style={{ marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="tc-label">{label}</span>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tc-mono"
        style={{
          background: 'var(--tc-bg-0)',
          color: 'var(--tc-text)',
          border: '1px solid var(--tc-line2)',
          padding: '8px 10px',
          fontSize: 13,
          letterSpacing: 1,
          outline: 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      {hint && <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-faint)' }}>{hint}</span>}
    </label>
  );
}
