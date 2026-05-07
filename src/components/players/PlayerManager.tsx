'use client';

import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Player } from '@prisma/client';
import { toast } from 'sonner';
import { TcPos } from '@/components/tactical/TcPos';
import { PlayerFormDialog } from './PlayerFormDialog';

type Props = {
  initialPlayers: Player[];
  draftLocked: boolean;
};

type FilterMode = 'ALL' | 'ACTIVE' | 'CAPT' | 'RETIRED';

export function PlayerManager({ initialPlayers, draftLocked }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<Player | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Player | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('ALL');
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  const filtered = useMemo(() => {
    return initialPlayers.filter((p) => {
      if (filter === 'CAPT' && !p.isCaptain) return false;
      if (filter === 'ACTIVE' && p.isRetired) return false;
      if (filter === 'RETIRED' && !p.isRetired) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.gameId.toLowerCase().includes(q) && !p.nickname.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [initialPlayers, filter, search]);

  async function performDelete(player: Player) {
    const res = await fetch(`/api/players/${player.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? '删除失败');
      return;
    }
    toast.success(`已删除 ${player.gameId}`);
    setConfirmDelete(null);
    refresh();
  }

  const captainsCount = initialPlayers.filter((p) => p.isCaptain).length;
  const retiredCount = initialPlayers.filter((p) => p.isRetired).length;

  return (
    <div
      className="tc-board"
      style={{ minHeight: '100%', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 30, background: 'var(--tc-amber)', boxShadow: '0 0 12px var(--tc-amber)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              ROSTER<span style={{ color: 'var(--tc-amber)' }}>{"//"}</span>MANAGER
            </div>
            <div className="tc-label">
              {initialPlayers.length} PLAYERS · {captainsCount} CAPTAINS · {retiredCount} RETIRED
              {draftLocked && (
                <span style={{ marginLeft: 8, color: 'var(--tc-red)' }}>· DRAFT LOCKED · READ-ONLY</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Link href="/admin/players/import" className="tc-btn">↑ IMPORT CSV/XLSX</Link>
          <button
            className="tc-btn tc-btn-primary"
            onClick={() => setCreating(true)}
            disabled={draftLocked}
            style={{ opacity: draftLocked ? 0.5 : 1 }}
          >
            + NEW PLAYER
          </button>
        </div>
      </header>

      <div className="tc-divider" />

      <div
        className="tc-card"
        style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}
      >
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="tc-label">FILTER</span>
            {(['ALL', 'ACTIVE', 'CAPT', 'RETIRED'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`tc-chip ${filter === f ? 'tc-chip-on' : ''}`}
                style={{ cursor: 'pointer', border: filter === f ? 'none' : '1px solid var(--tc-line2)' }}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search nickname or gameId…"
            className="tc-mono"
            style={{
              background: 'var(--tc-bg-0)',
              color: 'var(--tc-text)',
              border: '1px solid var(--tc-line2)',
              padding: '5px 10px',
              fontSize: 11,
              width: 260,
              letterSpacing: 1,
            }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr 160px 80px 80px 100px 110px',
            gap: 8,
            padding: '6px 8px',
            borderBottom: '1px solid var(--tc-line2)',
            background: 'rgba(0,229,255,0.04)',
          }}
        >
          {['GAME ID', 'NICKNAME', 'POSITIONS', 'COST', 'CAPT', 'STATUS', 'ACTIONS'].map((h) => (
            <span key={h} className="tc-label" style={{ fontSize: 9 }}>{h}</span>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div
              className="tc-mono"
              style={{ padding: 32, textAlign: 'center', color: 'var(--tc-text-faint)', fontSize: 12 }}
            >
              暂无选手 · 点击 NEW PLAYER 或 IMPORT 添加
            </div>
          ) : (
            filtered.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1fr 160px 80px 80px 100px 110px',
                  gap: 8,
                  padding: '8px 8px',
                  alignItems: 'center',
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                  borderBottom: '1px dashed var(--tc-line)',
                  opacity: p.isRetired ? 0.4 : 1,
                }}
              >
                <span className="tc-mono" style={{ fontSize: 11, color: 'var(--tc-cyan)' }}>@{p.gameId}</span>
                <span className="tc-display" style={{ fontSize: 13 }}>{p.nickname}</span>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {p.primaryPositions.map((x, j) => (<TcPos key={'p' + j} pos={x} size={16} on />))}
                  {p.secondaryPositions.map((x, j) => (<TcPos key={'s' + j} pos={x} size={16} />))}
                </div>
                <span className="tc-num" style={{ fontSize: 12, color: 'var(--tc-amber)' }}>{p.cost}</span>
                <span
                  className="tc-mono"
                  style={{ fontSize: 10, color: p.isCaptain ? 'var(--tc-cyan)' : 'var(--tc-text-faint)' }}
                >
                  {p.isCaptain ? '◆ YES' : '— no'}
                </span>
                <span
                  className="tc-chip"
                  style={{
                    background: p.isRetired ? 'rgba(255,61,92,0.15)' : 'rgba(61,255,156,0.10)',
                    borderColor: p.isRetired ? 'var(--tc-red)' : 'var(--tc-green)',
                    color: p.isRetired ? 'var(--tc-red)' : 'var(--tc-green)',
                  }}
                >
                  {p.isRetired ? 'RETIRED' : 'ACTIVE'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="tc-btn"
                    style={{ padding: '2px 8px', fontSize: 9 }}
                    onClick={() => setEditing(p)}
                    disabled={draftLocked}
                  >
                    EDIT
                  </button>
                  <button
                    className="tc-btn tc-btn-danger"
                    style={{ padding: '2px 8px', fontSize: 9 }}
                    onClick={() => setConfirmDelete(p)}
                    disabled={pending || draftLocked}
                  >
                    DEL
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 8,
            marginTop: 6,
            borderTop: '1px solid var(--tc-line)',
          }}
        >
          <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-dim)' }}>
            showing {filtered.length} of {initialPlayers.length}
          </span>
          <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
            {draftLocked ? 'config_lock=true · roster_lock=true' : 'config_lock=false · ops_normal'}
          </span>
        </div>
      </div>

      {creating && (
        <PlayerFormDialog
          mode="create"
          open
          onOpenChange={(o) => !o && setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
      {editing && (
        <PlayerFormDialog
          mode="edit"
          player={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(7,8,12,0.78)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="tc-card"
            style={{ width: 440, padding: 24, background: 'var(--tc-bg-1)', position: 'relative' }}
          >
            <span className="corner tl" style={{ borderColor: 'var(--tc-red)' }} />
            <span className="corner tr" style={{ borderColor: 'var(--tc-red)' }} />
            <span className="corner bl" style={{ borderColor: 'var(--tc-red)' }} />
            <span className="corner br" style={{ borderColor: 'var(--tc-red)' }} />

            <div className="tc-h2" style={{ color: 'var(--tc-red)', marginBottom: 8 }}>
              ⨯ DELETE PLAYER
            </div>
            <div className="tc-mono" style={{ fontSize: 12, color: 'var(--tc-text-dim)', marginBottom: 16 }}>
              即将删除 <code style={{ color: 'var(--tc-cyan)' }}>{confirmDelete.gameId}</code>（{confirmDelete.nickname}）及其登录账号。该操作无法撤销。
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="tc-btn" onClick={() => setConfirmDelete(null)}>CANCEL</button>
              <button
                className="tc-btn tc-btn-danger"
                onClick={() => performDelete(confirmDelete)}
                disabled={pending}
              >
                ⨯ CONFIRM DELETE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
