'use client';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

export type CaptainNoticeKind = 'started' | 'turn' | 'started-and-turn';

type Props = {
  kind: CaptainNoticeKind;
  /** Round number to mention; relevant for 'turn' / 'started-and-turn'. */
  currentRound?: number;
  /** Captain's remaining budget; shown for 'turn' / 'started-and-turn'. */
  budgetLeft?: number;
  emptySlots?: number;
  onConfirm: () => void;
};

/* ─── helpers ─── */
function polyHex(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  return pts.join(' ');
}

export function CaptainNotificationDialog({
  kind,
  currentRound,
  budgetLeft,
  emptySlots,
  onConfirm,
}: Props) {
  const isTurn = kind === 'turn' || kind === 'started-and-turn';
  const isStarted = kind === 'started' || kind === 'started-and-turn';

  // Dictate by kind
  const meta =
    kind === 'started-and-turn'
      ? {
          title: 'DRAFT INITIATED · YOU ARE ON CLOCK',
          subtitle: '▸ session_started + on_clock_signal',
          accent: 'var(--tc-cyan)',
        }
      : kind === 'turn'
      ? {
          title: 'YOU ARE ON CLOCK',
          subtitle: '▸ on_clock_signal :: pick required',
          accent: 'var(--tc-cyan)',
        }
      : {
          title: 'DRAFT INITIATED',
          subtitle: '▸ session_started :: roster locked',
          accent: 'var(--tc-amber)',
        };

  // ENTER to ack
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm]);

  return (
    <Dialog open onOpenChange={(o) => !o && onConfirm()}>
      <DialogContent
        className="max-w-md p-0 gap-0 border-0 bg-transparent shadow-none"
        style={{ animation: 'tc-slide-up .35s cubic-bezier(.2,.9,.3,1)' }}
      >
        <div
          className="tc-card"
          style={{
            position: 'relative',
            border: `1px solid ${meta.accent}`,
            boxShadow: `0 0 40px ${meta.accent}40, inset 0 0 30px ${meta.accent}10`,
          }}
        >
          <span className="corner tl" style={{ borderColor: meta.accent }} />
          <span className="corner tr" style={{ borderColor: meta.accent }} />
          <span className="corner bl" style={{ borderColor: meta.accent }} />
          <span className="corner br" style={{ borderColor: meta.accent }} />

          {/* Top stripe — pulses for turn states */}
          <div
            style={{
              height: 3,
              background: meta.accent,
              boxShadow: `0 0 14px ${meta.accent}, 0 0 24px ${meta.accent}80`,
              animation: isTurn ? 'tc-pulse 1.4s ease-in-out infinite' : undefined,
            }}
          />

          {/* HEADER */}
          <DialogHeader
            className="space-y-0"
            style={{
              padding: '18px 22px 14px',
              borderBottom: '1px solid var(--tc-line)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <span
                className="tc-chip"
                style={{
                  background: `${meta.accent}18`,
                  borderColor: meta.accent as string,
                  color: meta.accent as string,
                  animation: isTurn ? 'tc-blink 1s step-end infinite' : undefined,
                }}
              >
                ● {isTurn ? 'PRIORITY_ALERT' : 'SYS_NOTICE'}
              </span>
              <span
                className="tc-mono"
                style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}
              >
                evt#{Date.now() % 1000} · ack_required
              </span>
            </div>

            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {/* Hex glyph */}
              <div
                style={{
                  flexShrink: 0,
                  width: 56,
                  height: 56,
                  position: 'relative',
                }}
              >
                <svg width="56" height="56" viewBox="0 0 56 56" style={{ overflow: 'visible' }}>
                  <polygon
                    points={polyHex(28, 28, 24)}
                    fill={`${meta.accent}15`}
                    stroke={meta.accent as string}
                    strokeWidth={1.5}
                  />
                  <polygon
                    points={polyHex(28, 28, 18)}
                    fill="none"
                    stroke={`${meta.accent}60`}
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                  {isTurn ? (
                    <g
                      stroke={meta.accent as string}
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="20" y1="28" x2="36" y2="28" />
                      <polyline points="30,22 36,28 30,34" />
                    </g>
                  ) : (
                    <g
                      stroke={meta.accent as string}
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                    >
                      <path d="M 20 32 A 10 10 0 1 0 36 32" />
                      <line x1="28" y1="18" x2="28" y2="30" />
                    </g>
                  )}
                </svg>
                {isTurn && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: -3,
                      border: `1px solid ${meta.accent}`,
                      animation: 'tc-pulse 1.4s ease-in-out infinite',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <DialogTitle asChild>
                  <div
                    className="tc-display"
                    style={{
                      fontSize: 19,
                      lineHeight: 1.2,
                      color: 'var(--tc-text)',
                      textShadow: `0 0 10px ${meta.accent}60`,
                      letterSpacing: 1,
                    }}
                  >
                    {meta.title}
                  </div>
                </DialogTitle>
                <div
                  className="tc-mono"
                  style={{
                    fontSize: 10,
                    color: meta.accent as string,
                    marginTop: 4,
                    letterSpacing: 1,
                  }}
                >
                  {meta.subtitle}
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* BODY */}
          <div style={{ padding: '16px 22px 18px' }}>
            {isStarted && (
              <div
                style={{
                  padding: '10px 12px',
                  marginBottom: isTurn ? 12 : 0,
                  background: 'rgba(255,178,61,0.06)',
                  borderLeft: '3px solid var(--tc-amber)',
                }}
              >
                <div
                  className="tc-label"
                  style={{ color: 'var(--tc-amber)', fontSize: 10 }}
                >
                  ▸ SESSION_STARTED
                </div>
                <div
                  className="tc-mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--tc-text-dim)',
                    marginTop: 3,
                    lineHeight: 1.55,
                  }}
                >
                  管理员已开启选秀。名册和配置已锁定。
                  <br />
                  <span style={{ color: 'var(--tc-text-faint)' }}>
                    config_lock=true · roster_lock=true
                  </span>
                </div>
              </div>
            )}

            {isTurn && (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'rgba(0,229,255,0.06)',
                  borderLeft: '3px solid var(--tc-cyan)',
                }}
              >
                <div
                  className="tc-label"
                  style={{ color: 'var(--tc-cyan)', fontSize: 10 }}
                >
                  ▸ ACTION_REQUIRED
                </div>
                <div
                  className="tc-mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--tc-text-dim)',
                    marginTop: 3,
                    lineHeight: 1.55,
                  }}
                >
                  请从右侧候选池选择一名选手并指定其位置。
                  {currentRound != null && (
                    <>
                      {' '}
                      当前为
                      <span style={{ color: 'var(--tc-cyan)' }}>
                        {' '}
                        round_{String(currentRound).padStart(2, '0')}
                      </span>
                      。
                    </>
                  )}
                </div>

                {(budgetLeft != null || emptySlots != null) && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    {budgetLeft != null && (
                      <div
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          background: 'var(--tc-bg-0)',
                          border: '1px solid var(--tc-line2)',
                        }}
                      >
                        <div className="tc-label" style={{ fontSize: 9 }}>
                          REMAINING
                        </div>
                        <div
                          className="tc-num"
                          style={{
                            fontSize: 18,
                            color: 'var(--tc-green)',
                            marginTop: 1,
                          }}
                        >
                          {budgetLeft}
                          <span
                            className="tc-mono"
                            style={{
                              fontSize: 10,
                              color: 'var(--tc-text-dim)',
                              marginLeft: 3,
                            }}
                          >
                            CR
                          </span>
                        </div>
                      </div>
                    )}
                    {emptySlots != null && (
                      <div
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          background: 'var(--tc-bg-0)',
                          border: '1px solid var(--tc-line2)',
                        }}
                      >
                        <div className="tc-label" style={{ fontSize: 9 }}>
                          EMPTY SLOTS
                        </div>
                        <div
                          className="tc-num"
                          style={{
                            fontSize: 18,
                            color: 'var(--tc-amber)',
                            marginTop: 1,
                          }}
                        >
                          {emptySlots}
                          <span
                            className="tc-mono"
                            style={{
                              fontSize: 10,
                              color: 'var(--tc-text-dim)',
                              marginLeft: 3,
                            }}
                          >
                            / 5
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FOOTER */}
          <DialogFooter
            style={{
              padding: '12px 22px 18px',
              borderTop: '1px solid var(--tc-line)',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <span
              className="tc-mono"
              style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}
            >
              <span style={{ color: 'var(--tc-green)' }}>●</span> sse_connected ·
              press ENTER to ack
            </span>
            <Button
              onClick={onConfirm}
              className="tc-btn tc-btn-primary"
              style={{
                minWidth: 140,
                justifyContent: 'center',
                borderColor: meta.accent,
                color: meta.accent === 'var(--tc-cyan)' ? 'var(--tc-bg-0)' : (meta.accent as string),
                background:
                  meta.accent === 'var(--tc-cyan)' ? 'var(--tc-cyan)' : 'transparent',
              }}
            >
              ▸ ACK · 我知道了
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
