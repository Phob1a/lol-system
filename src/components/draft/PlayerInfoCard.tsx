'use client';

import type { PlayerRef } from '@/lib/teams/preview';
import { TcPos } from '@/components/tactical/TcPos';

export function PlayerInfoCard({ player }: { player: PlayerRef }) {
  return (
    <div
      className="tc-card"
      style={{
        padding: 12,
        position: 'relative',
        background: 'var(--tc-bg-1)',
        border: '1px solid var(--tc-line2)',
      }}
    >
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tc-display" style={{ fontSize: 14 }}>{player.nickname}</div>
          <div className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-cyan)' }}>@{player.gameId}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tc-label" style={{ fontSize: 9 }}>COST</div>
          <div className="tc-num" style={{ fontSize: 16, color: 'var(--tc-amber)' }}>
            {player.cost}
            <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-dim)', marginLeft: 2 }}>CR</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="tc-label" style={{ fontSize: 9 }}>PRIMARY</div>
        <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
          {player.primaryPositions.map((p) => (
            <TcPos key={`p-${p}`} pos={p} size={18} on />
          ))}
        </div>
      </div>

      {player.secondaryPositions.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="tc-label" style={{ fontSize: 9 }}>SECONDARY</div>
          <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
            {player.secondaryPositions.map((p) => (
              <TcPos key={`s-${p}`} pos={p} size={18} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
