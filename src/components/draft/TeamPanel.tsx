'use client';

import type { TeamPreview } from '@/lib/teams/preview';
import { TcPos } from '@/components/tactical/TcPos';
import { POSITION_LABEL } from '@/components/players/positions';

type Props = {
  team: TeamPreview;
  isOwn?: boolean;
};

export function TeamPanel({ team, isOwn }: Props) {
  const filledPositions = team.slots.filter((s) => s.player).map((s) => s.position);
  const accent = isOwn ? 'var(--tc-cyan)' : 'var(--tc-line2)';

  return (
    <div
      className="tc-card"
      style={{
        padding: 12,
        position: 'relative',
        border: `1px solid ${accent}`,
        background: isOwn ? 'rgba(0,229,255,0.04)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <span className="corner tl" style={{ borderColor: accent }} />
      <span className="corner tr" style={{ borderColor: accent }} />
      <span className="corner bl" style={{ borderColor: accent }} />
      <span className="corner br" style={{ borderColor: accent }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tc-display" style={{ fontSize: 14, color: isOwn ? 'var(--tc-cyan)' : 'var(--tc-text)' }}>
            {team.captainNickname}
            {isOwn && (
              <span className="tc-chip tc-chip-on" style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px' }}>
                MINE
              </span>
            )}
          </div>
          <div className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
            @{team.captainGameId}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tc-label" style={{ fontSize: 9 }}>BUDGET</div>
          <div className="tc-num" style={{ fontSize: 15, color: 'var(--tc-amber)' }}>
            {team.budgetLeft}
            <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-dim)', marginLeft: 2 }}>CR</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
        {(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const).map((p) => (
          <TcPos
            key={p}
            pos={p}
            size={18}
            on={filledPositions.includes(p)}
            dim={!filledPositions.includes(p)}
          />
        ))}
      </div>

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {team.slots.map((slot) => (
          <div
            key={slot.position}
            style={{
              display: 'grid',
              gridTemplateColumns: '46px 1fr auto',
              gap: 8,
              alignItems: 'center',
              padding: '4px 6px',
              background: slot.player ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)',
              border: '1px solid var(--tc-line)',
              fontSize: 11,
            }}
          >
            <span className="tc-label" style={{ fontSize: 9 }}>
              {POSITION_LABEL[slot.position]}
            </span>
            {slot.player ? (
              <span
                style={{
                  minWidth: 0,
                  fontFamily: 'var(--tc-font-display)',
                  color: 'var(--tc-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {slot.player.nickname}
                <span className="tc-mono" style={{ marginLeft: 6, fontSize: 9, color: 'var(--tc-text-faint)' }}>
                  @{slot.player.gameId}
                </span>
              </span>
            ) : (
              <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>— empty —</span>
            )}
            <span
              className="tc-num"
              style={{ fontSize: 11, color: slot.player ? 'var(--tc-amber)' : 'var(--tc-text-faint)' }}
            >
              {slot.player ? slot.player.cost : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
