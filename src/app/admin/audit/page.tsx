import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = {
  DRAFT_STARTED: '选秀启动',
  ROUND_STARTED: '轮次启动',
  PICK_MADE: '出手',
  PICK_REVOKED: '撤销 pick',
  ROUND_REWOUND: '回退一轮',
  DRAFT_RESET: '重置选秀',
  SLOT_REARRANGED: '位置调整',
  ORDER_SET: '设置顺序',
};

function eventColor(type: string): string {
  if (type.startsWith('PICK_MADE')) return 'var(--tc-cyan)';
  if (type.endsWith('STARTED')) return 'var(--tc-green)';
  if (type === 'PICK_REVOKED' || type === 'ROUND_REWOUND' || type === 'DRAFT_RESET') return 'var(--tc-red)';
  if (type === 'SLOT_REARRANGED') return 'var(--tc-amber)';
  return 'var(--tc-text)';
}

export default async function AuditPage() {
  const events = await prisma.draftEvent.findMany({
    orderBy: { seq: 'desc' },
    take: 200,
  });

  const userIds = Array.from(new Set(events.map((e) => e.actorId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, role: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div
      className="tc-board"
      style={{ minHeight: '100%', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 30, background: 'var(--tc-green)', boxShadow: '0 0 12px var(--tc-green)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              AUDIT<span style={{ color: 'var(--tc-green)' }}>{"//"}</span>TRAIL
            </div>
            <div className="tc-label">APPEND-ONLY EVENT LOG · MONOTONIC SEQ · LATEST 200</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="tc-chip">{events.length} EVENTS</span>
          <a href="/api/draft/export?format=json" className="tc-btn">↓ EXPORT JSON</a>
          <a href="/api/draft/export?format=csv" className="tc-btn">↓ EXPORT CSV</a>
        </div>
      </header>

      <div className="tc-divider" />

      <div
        className="tc-card"
        style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}
      >
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

        {events.length === 0 ? (
          <div
            className="tc-mono"
            style={{ padding: 32, textAlign: 'center', color: 'var(--tc-text-faint)', fontSize: 12 }}
          >
            暂无事件 · 启动选秀后将在此记录
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 170px 140px 140px 1fr',
                gap: 12,
                padding: '6px 10px',
                borderBottom: '1px solid var(--tc-line2)',
                background: 'rgba(61,255,156,0.04)',
              }}
            >
              {['SEQ', 'TIMESTAMP', 'TYPE', 'ACTOR', 'PAYLOAD'].map((h) => (
                <span key={h} className="tc-label" style={{ fontSize: 9 }}>
                  {h}
                </span>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--tc-font-mono)' }}>
              {events.map((e, i) => {
                const c = eventColor(e.type);
                const actor = userById.get(e.actorId);
                return (
                  <div
                    key={e.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 170px 140px 140px 1fr',
                      gap: 12,
                      padding: '8px 10px',
                      alignItems: 'center',
                      fontSize: 11,
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                      borderBottom: '1px dashed var(--tc-line)',
                    }}
                  >
                    <span style={{ color: 'var(--tc-text-faint)' }}>#{e.seq}</span>
                    <span style={{ color: 'var(--tc-text-dim)' }}>
                      {new Date(e.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
                    </span>
                    <span style={{ color: c, fontWeight: 600, letterSpacing: 1 }}>
                      {EVENT_LABEL[e.type] ?? e.type}
                    </span>
                    <span style={{ color: 'var(--tc-cyan)' }}>
                      {actor?.username ?? e.actorId.slice(0, 6)}
                      {actor && <span style={{ marginLeft: 4, color: 'var(--tc-text-faint)' }}>· {actor.role}</span>}
                    </span>
                    <span style={{ color: 'var(--tc-text-dim)', overflowX: 'auto' }}>
                      {typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload ?? {})}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
