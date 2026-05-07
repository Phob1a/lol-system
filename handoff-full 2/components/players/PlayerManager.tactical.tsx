'use client';

/** Tactical · 选手名册管理（保留原 fetch / state 逻辑） */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TcPos } from '@/components/tactical/TcPos';

type Player = {
  id: number;
  gameId: string;
  name: string;
  primary: string[];
  secondary?: string[];
  cost: number;
  isCaptain?: boolean;
  retired?: boolean;
};

export function PlayerManager({ players: initial }: { players: Player[] }) {
  const router = useRouter();
  const [players, setPlayers] = useState(initial);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL'|'ACTIVE'|'CAPT'|'RETIRED'>('ALL');
  const [pending, start] = useTransition();

  const filtered = players.filter(p => {
    if (filter === 'CAPT' && !p.isCaptain) return false;
    if (filter === 'ACTIVE' && p.retired)   return false;
    if (filter === 'RETIRED' && !p.retired) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.gameId.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const remove = (id: number) => start(async () => {
    if (!confirm('删除该选手？')) return;
    const r = await fetch(`/api/players/${id}`, { method: 'DELETE' });
    if (!r.ok) { toast.error('删除失败'); return; }
    setPlayers(players.filter(p => p.id !== id));
    toast.success('已删除');
    router.refresh();
  });

  return (
    <div className="tc-board" style={{ minHeight: '100%', padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 30, background: 'var(--tc-amber)',
            boxShadow: '0 0 12px var(--tc-amber)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              ROSTER<span style={{ color: 'var(--tc-amber)' }}>//</span>MANAGER
            </div>
            <div className="tc-label">
              {players.length} PLAYERS · {players.filter(p => p.isCaptain).length} CAPTAINS · {players.filter(p => p.retired).length} RETIRED
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href="/admin/players/import" className="tc-btn">↑ IMPORT CSV/XLSX</a>
          <button className="tc-btn tc-btn-primary">+ NEW PLAYER</button>
        </div>
      </header>

      <div className="tc-divider" />

      <div className="tc-card" style={{ padding: 14, flex: 1,
        display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="tc-label">FILTER</span>
            {(['ALL','ACTIVE','CAPT','RETIRED'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`tc-chip ${filter === f ? 'tc-chip-on' : ''}`}
                style={{ cursor: 'pointer',
                  border: filter === f ? 'none' : '1px solid var(--tc-line2)' }}>
                {f}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search name or gameId…" className="tc-mono"
            style={{ background: 'var(--tc-bg-0)', color: 'var(--tc-text)',
              border: '1px solid var(--tc-line2)', padding: '5px 10px',
              fontSize: 11, width: 220, letterSpacing: 1 }} />
        </div>

        {/* head */}
        <div style={{ display: 'grid',
          gridTemplateColumns: '40px 100px 1fr 140px 80px 80px 100px 110px',
          gap: 8, padding: '6px 8px',
          borderBottom: '1px solid var(--tc-line2)',
          background: 'rgba(0,229,255,0.04)' }}>
          {['#','GAME ID','NAME','POSITIONS','COST','CAPT','STATUS','ACTIONS'].map(h => (
            <span key={h} className="tc-label" style={{ fontSize: 9 }}>{h}</span>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map((p, i) => (
            <div key={p.id} style={{
              display: 'grid',
              gridTemplateColumns: '40px 100px 1fr 140px 80px 80px 100px 110px',
              gap: 8, padding: '6px 8px', alignItems: 'center',
              background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
              borderBottom: '1px dashed var(--tc-line)',
              opacity: p.retired ? 0.4 : 1,
            }}>
              <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
                {String(p.id).padStart(3,'0')}
              </span>
              <span className="tc-mono" style={{ fontSize: 11, color: 'var(--tc-cyan)' }}>@{p.gameId}</span>
              <span className="tc-display" style={{ fontSize: 13 }}>{p.name}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {p.primary.map((x, j) => <TcPos key={'p'+j} pos={x} size={16} on />)}
                {p.secondary?.map((x, j) => <TcPos key={'s'+j} pos={x} size={16} />)}
              </div>
              <span className="tc-num" style={{ fontSize: 12, color: 'var(--tc-amber)' }}>{p.cost}</span>
              <span className="tc-mono" style={{ fontSize: 10,
                color: p.isCaptain ? 'var(--tc-cyan)' : 'var(--tc-text-faint)' }}>
                {p.isCaptain ? '◆ YES' : '— no'}
              </span>
              <span className="tc-chip" style={{
                background: p.retired ? 'rgba(255,61,92,0.15)' : 'rgba(61,255,156,0.10)',
                borderColor: p.retired ? 'var(--tc-red)' : 'var(--tc-green)',
                color: p.retired ? 'var(--tc-red)' : 'var(--tc-green)',
              }}>{p.retired ? 'RETIRED' : 'ACTIVE'}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="tc-btn" style={{ padding: '2px 8px', fontSize: 9 }}>EDIT</button>
                <button onClick={() => remove(p.id)} disabled={pending}
                  className="tc-btn tc-btn-danger" style={{ padding: '2px 8px', fontSize: 9 }}>
                  DEL
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between',
          paddingTop: 8, marginTop: 6, borderTop: '1px solid var(--tc-line)' }}>
          <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-dim)' }}>
            showing {filtered.length} of {players.length}
          </span>
          <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
            ⌘+N new · ⌘+I import · / search
          </span>
        </div>
      </div>
    </div>
  );
}
