'use client';

/** Tactical · DraftControl
 *  保留原文件全部业务逻辑（SSE 订阅 / start / round / reset / pick 等 fetch 调用）。
 *  这是视觉外壳；如需直接替换原文件，把内部 hooks 与原版同步即可。
 *  此版本以 props 形式接收 snapshot 数据，由 page.tactical 提供。
 */
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { TcCard } from '@/components/tactical/TcCard';
import { TcBar } from '@/components/tactical/TcBar';
import { TcPos } from '@/components/tactical/TcPos';
import { HudTimer } from '@/components/tactical/HudTimer';

type Snapshot = any; // 沿用 getDraftSnapshot 返回类型

export function DraftControl({ initial }: { initial: Snapshot }) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [mode, setMode] = useState<'OPS' | 'BROADCAST'>('OPS');
  const [pending, start] = useTransition();

  // SSE 订阅
  useEffect(() => {
    const es = new EventSource('/api/draft/stream');
    es.onmessage = (e) => {
      try { setSnap(JSON.parse(e.data)); } catch {}
    };
    return () => es.close();
  }, []);

  const post = (url: string, body?: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

  const onStart = () => start(async () => {
    const r = await post('/api/draft/start');
    if (!r.ok) toast.error('启动失败');
  });
  const onNextRound = () => start(async () => {
    const r = await post('/api/draft/round/next');
    if (!r.ok) toast.error('进入下一轮失败');
  });
  const onReset = () => start(async () => {
    if (!confirm('重置后所有选秀记录将清空，是否继续？')) return;
    const r = await post('/api/draft/reset');
    if (!r.ok) toast.error('重置失败');
  });

  const status: string = snap?.status ?? 'IDLE';
  const round: number = snap?.currentRound ?? 0;
  const onClock: string | undefined = snap?.onClock?.teamName;
  const deadline: number | undefined = snap?.pickDeadline;
  const pickClock: number = snap?.pickClock ?? 45;

  const accent =
    status === 'IN_PROGRESS' ? 'var(--tc-cyan)'
    : status === 'COMPLETED' ? 'var(--tc-green)'
    : 'var(--tc-amber)';

  return (
    <div className="tc-board" style={{ minHeight: '100%', padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 30, background: accent, boxShadow: `0 0 12px ${accent}` }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              DRAFT<span style={{ color: accent }}>//</span>CONSOLE
            </div>
            <div className="tc-label">
              SESSION {snap?.sessionId ?? '—'} · STATUS {status} · ROUND {round}/{snap?.totalRounds ?? '?'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setMode('OPS')}
            className={`tc-btn ${mode === 'OPS' ? 'tc-btn-primary' : ''}`}>OPS</button>
          <button onClick={() => setMode('BROADCAST')}
            className={`tc-btn ${mode === 'BROADCAST' ? 'tc-btn-primary' : ''}`}>BROADCAST</button>
        </div>
      </header>

      <div className="tc-divider" />

      {mode === 'OPS' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.4fr', gap: 12, flex: 1, minHeight: 0 }}>
          {/* CONTROL */}
          <TcCard tab="CONTROL">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
              <button onClick={onStart} disabled={pending || status === 'IN_PROGRESS'}
                className="tc-btn tc-btn-primary" style={{ justifyContent: 'center' }}>
                ▸ START DRAFT
              </button>
              <button onClick={onNextRound} disabled={pending || status !== 'IN_PROGRESS'}
                className="tc-btn">▸ NEXT ROUND</button>
              <button onClick={onReset} disabled={pending}
                className="tc-btn tc-btn-danger">⨯ ABORT & RESET</button>

              <div className="tc-divider" style={{ margin: '8px 0' }} />

              <div className="tc-label">ON CLOCK</div>
              <div className="tc-display" style={{ fontSize: 18, color: 'var(--tc-cyan)' }}>
                {onClock ?? '— idle —'}
              </div>
              {deadline && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
                  <HudTimer deadline={deadline} max={pickClock} />
                </div>
              )}
            </div>
          </TcCard>

          {/* TEAMS */}
          <TcCard tab="TEAMS">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 6 }}>
              {(snap?.teams ?? []).map((t: any) => (
                <div key={t.id} style={{
                  padding: '8px 10px', border: '1px solid var(--tc-line)',
                  background: t.onClock ? 'rgba(0,229,255,0.06)' : 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="tc-display" style={{ fontSize: 13,
                      color: t.onClock ? 'var(--tc-cyan)' : 'var(--tc-text)' }}>
                      {t.name}
                    </span>
                    <span className="tc-num" style={{ fontSize: 12, color: 'var(--tc-amber)' }}>
                      {t.budgetLeft}<span className="tc-mono" style={{ fontSize: 9, marginLeft: 2 }}>CR</span>
                    </span>
                  </div>
                  <TcBar pct={(t.budgetLeft ?? 0) / (t.budgetTotal || 1)} w="100%" />
                  <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                    {['TOP','JG','MID','ADC','SUP'].map(p => (
                      <TcPos key={p} pos={p} size={18}
                        on={!!t.filled?.includes(p)} dim={!t.filled?.includes(p)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TcCard>

          {/* EVENT LOG */}
          <TcCard tab="EVENT LOG">
            <div style={{ marginTop: 6, fontFamily: 'var(--tc-font-mono)', fontSize: 11,
              color: 'var(--tc-text-dim)', maxHeight: 600, overflowY: 'auto' }}>
              {(snap?.events ?? []).slice(0, 60).map((e: any) => (
                <div key={e.seq} style={{
                  padding: '4px 0', borderBottom: '1px dashed var(--tc-line)',
                  display: 'grid', gridTemplateColumns: '40px 90px 1fr', gap: 8,
                }}>
                  <span style={{ color: 'var(--tc-text-faint)' }}>#{e.seq}</span>
                  <span style={{ color: 'var(--tc-cyan)' }}>{e.type}</span>
                  <span>{e.detail}</span>
                </div>
              ))}
            </div>
          </TcCard>
        </div>
      ) : (
        // BROADCAST 模式 — 大字 + 倒计时 + 当前选手
        <div style={{ flex: 1, display: 'grid',
          gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto 1fr',
          gap: 16, padding: 16,
          background: 'radial-gradient(ellipse at center, rgba(0,229,255,0.05), transparent)' }}>
          <TcCard tab="ROUND" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="tc-display" style={{ fontSize: 56, color: 'var(--tc-cyan)' }}>
                ROUND {round}<span style={{ color: 'var(--tc-text-faint)', fontSize: 28 }}>
                  /{snap?.totalRounds ?? '?'}
                </span>
              </div>
              {deadline && <HudTimer deadline={deadline} max={pickClock} size={140} />}
            </div>
          </TcCard>

          <TcCard tab="ON CLOCK">
            <div className="tc-display" style={{ fontSize: 44, color: 'var(--tc-cyan)',
              textShadow: '0 0 16px var(--tc-cyan)', marginTop: 8 }}>
              {onClock ?? '—'}
            </div>
          </TcCard>

          <TcCard tab="LAST PICK">
            <div className="tc-display" style={{ fontSize: 28, color: 'var(--tc-text)', marginTop: 8 }}>
              {snap?.lastPick?.player ?? '—'}
            </div>
            <div className="tc-mono" style={{ fontSize: 14, color: 'var(--tc-amber)' }}>
              {snap?.lastPick ? `${snap.lastPick.team} · ${snap.lastPick.position} · ${snap.lastPick.cost} CR` : ''}
            </div>
          </TcCard>
        </div>
      )}
    </div>
  );
}
