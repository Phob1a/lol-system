'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type Props = {
  initial: {
    teamBudget: number;
    rounds: number;
    pickClock: number;
    minBid: number;
    maxBid: number;
  };
  locked?: boolean;
};

const ROUND_MODES = [
  { id: 'BUDGET_DESC',  desc: 'highest remaining budget picks first' },
  { id: 'REVERSE_LAST', desc: 'reverse order from previous round' },
  { id: 'ADMIN_ORDER',  desc: 'admin-defined sequence' },
  { id: 'MANUAL',       desc: 'admin announces each pick manually' },
] as const;

export function ConfigForm({ initial, locked = false }: Props) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setSaving(true);
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v),
    });
    setSaving(false);
    if (!res.ok) { toast.error('保存失败'); return; }
    toast.success('配置已保存');
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="tc-board"
      style={{ minHeight: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 30, background: 'var(--tc-amber)',
            boxShadow: '0 0 12px var(--tc-amber)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              SESSION<span style={{ color: 'var(--tc-amber)' }}>//</span>CONFIG
            </div>
            <div className="tc-label">LOCKS BEFORE DRAFT START</div>
          </div>
        </div>
        <span className="tc-chip" style={{
          background: locked ? 'rgba(255,178,61,0.14)' : 'rgba(61,255,156,0.10)',
          borderColor: locked ? 'var(--tc-amber)' : 'var(--tc-green)',
          color: locked ? 'var(--tc-amber)' : 'var(--tc-green)',
        }}>
          {locked ? '◇ LOCKED · DRAFT IN PROGRESS' : '◇ EDITABLE'}
        </span>
      </header>

      <div className="tc-divider" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1 }}>
        {/* ECONOMY + STRUCTURE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="ECONOMY">
            <NumField label="TEAM BUDGET (CR)" value={v.teamBudget} disabled={locked}
              onChange={n => setV({ ...v, teamBudget: n })}
              hint="each team starts with this credit pool" />
            <NumField label="MIN BID" value={v.minBid} disabled={locked}
              onChange={n => setV({ ...v, minBid: n })} hint="floor for any single pick" />
            <NumField label="MAX BID" value={v.maxBid} disabled={locked}
              onChange={n => setV({ ...v, maxBid: n })} hint="ceiling per pick · prevents whaling" />
          </Card>

          <Card title="STRUCTURE">
            <Pillset label="ROUNDS PER DRAFT" options={[1,2,3,4,5]}
              value={v.rounds} disabled={locked}
              onChange={n => setV({ ...v, rounds: n })} />
            <Pillset label="PICK CLOCK (SEC)" options={[30,45,60,90]} suffix="s"
              value={v.pickClock} disabled={locked}
              onChange={n => setV({ ...v, pickClock: n })} />
          </Card>
        </div>

        {/* ROUND PLAN — informational, persisted via separate route */}
        <Card title="ROUND MODE PLAN">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: v.rounds }).map((_, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 200px',
                gap: 10, alignItems: 'center', padding: '10px 12px',
                background: 'rgba(255,255,255,0.02)', border: '1px solid var(--tc-line)',
              }}>
                <span className="tc-display" style={{ fontSize: 18, color: 'var(--tc-cyan)' }}>R{i+1}</span>
                <div>
                  <div className="tc-mono" style={{ fontSize: 12, color: 'var(--tc-text)' }}>
                    {ROUND_MODES[i % 4].id}
                  </div>
                  <div className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-dim)' }}>
                    {ROUND_MODES[i % 4].desc}
                  </div>
                </div>
                <select disabled={locked} defaultValue={ROUND_MODES[i % 4].id}
                  style={{ background: 'var(--tc-bg-0)', color: 'var(--tc-cyan)',
                    border: '1px solid var(--tc-line2)', padding: '5px 10px',
                    fontSize: 11, letterSpacing: 1, fontFamily: 'var(--tc-font-mono)' }}>
                  {ROUND_MODES.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              </div>
            ))}
            <p className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)', marginTop: 4 }}>
              注：轮次模式通过 /api/draft/round 单独配置；这里仅展示。
            </p>
          </div>
        </Card>
      </div>

      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="tc-btn" disabled={saving}>DISCARD</button>
        <button type="submit" className="tc-btn tc-btn-primary" disabled={locked || saving}>
          {saving ? '▸ SAVING…' : '▸ SAVE & LOCK READY'}
        </button>
      </footer>
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tc-card" style={{ padding: 16 }}>
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />
      <div className="tc-h3" style={{ marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

function NumField({ label, value, onChange, hint, disabled }: {
  label: string; value: number; onChange: (n: number) => void; hint?: string; disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="tc-label">{label}</span>
      <input type="number" value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))} className="tc-mono"
        style={{ background: 'var(--tc-bg-0)', color: 'var(--tc-text)',
          border: '1px solid var(--tc-line2)', padding: '8px 10px',
          fontSize: 13, letterSpacing: 1, outline: 'none',
          opacity: disabled ? 0.5 : 1 }} />
      {hint && <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-faint)' }}>{hint}</span>}
    </label>
  );
}

function Pillset({ label, options, value, onChange, suffix = '', disabled }: {
  label: string; options: number[]; value: number; onChange: (n: number) => void;
  suffix?: string; disabled?: boolean;
}) {
  return (
    <div>
      <span className="tc-label">{label}</span>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        {options.map(n => (
          <button key={n} type="button" disabled={disabled}
            onClick={() => onChange(n)}
            className={`tc-chip ${value === n ? 'tc-chip-on' : ''}`}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: 12, padding: '4px 12px',
              border: value === n ? 'none' : '1px solid var(--tc-line2)',
              opacity: disabled ? 0.5 : 1 }}>
            {n}{suffix}
          </button>
        ))}
      </div>
    </div>
  );
}
