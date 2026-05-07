import { prisma } from '@/lib/db';

export default async function AuditPage() {
  const events = await prisma.draftEvent.findMany({
    orderBy: { seq: 'desc' },
    take: 200,
  });

  return (
    <div className="tc-board" style={{ minHeight: '100%', padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 30, background: 'var(--tc-green)',
            boxShadow: '0 0 12px var(--tc-green)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              AUDIT<span style={{ color: 'var(--tc-green)' }}>//</span>TRAIL
            </div>
            <div className="tc-label">APPEND-ONLY EVENT LOG · MONOTONIC SEQ</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="tc-chip">{events.length} EVENTS</span>
          <a href="/api/draft/export?format=json" className="tc-btn">↓ EXPORT JSON</a>
          <a href="/api/draft/export?format=csv" className="tc-btn">↓ EXPORT CSV</a>
        </div>
      </header>

      <div className="tc-divider" />

      <div className="tc-card" style={{ padding: 14, flex: 1,
        display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

        <div style={{ display: 'grid',
          gridTemplateColumns: '60px 180px 180px 180px 1fr',
          gap: 12, padding: '6px 10px',
          borderBottom: '1px solid var(--tc-line2)',
          background: 'rgba(61,255,156,0.04)' }}>
          {['SEQ','TIMESTAMP','TYPE','ACTOR','DETAIL'].map(h => (
            <span key={h} className="tc-label" style={{ fontSize: 9 }}>{h}</span>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--tc-font-mono)' }}>
          {events.map((e: any, i: number) => {
            const c = String(e.type).startsWith('PICK') ? 'var(--tc-cyan)'
              : String(e.type).includes('STARTED') ? 'var(--tc-green)'
              : String(e.type).includes('CONFIG') || String(e.type).includes('LOCK') ? 'var(--tc-amber)'
              : String(e.type) === 'AUTH' ? 'var(--tc-purple)' : 'var(--tc-text)';
            return (
              <div key={e.seq} style={{
                display: 'grid',
                gridTemplateColumns: '60px 180px 180px 180px 1fr',
                gap: 12, padding: '8px 10px', alignItems: 'center', fontSize: 11,
                background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                borderBottom: '1px dashed var(--tc-line)',
              }}>
                <span style={{ color: 'var(--tc-text-faint)' }}>#{e.seq}</span>
                <span style={{ color: 'var(--tc-text-dim)' }}>
                  {new Date(e.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
                </span>
                <span style={{ color: c, fontWeight: 600, letterSpacing: 1 }}>{e.type}</span>
                <span style={{ color: 'var(--tc-text)' }}>{e.actor ?? '—'}</span>
                <span style={{ color: 'var(--tc-text-dim)' }}>
                  {typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload ?? {})}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
