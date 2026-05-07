import Link from 'next/link';
import { prisma } from '@/lib/db';

export default async function AdminOverviewPage() {
  const [playerCount, captainCount, draftSession] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: { isCaptain: true } as any }).catch(() => 0),
    prisma.draftSession.findFirst({ orderBy: { createdAt: 'desc' } }).catch(() => null),
  ]);

  const cards = [
    { href: '/admin/config',  title: 'CONFIG',  desc: '预算 / 轮次 / 时钟', accent: 'var(--tc-amber)' },
    { href: '/admin/players', title: 'ROSTER',  desc: `${playerCount} 选手 · ${captainCount} 队长`, accent: 'var(--tc-cyan)' },
    { href: '/admin/draft',   title: 'DRAFT',   desc: draftSession?.status ?? 'IDLE', accent: 'var(--tc-green)' },
    { href: '/admin/audit',   title: 'AUDIT',   desc: '事件日志', accent: 'var(--tc-purple)' },
  ];

  return (
    <div className="tc-board" style={{ minHeight: '100%', padding: 24,
      display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 4, height: 30, background: 'var(--tc-cyan)',
          boxShadow: '0 0 12px var(--tc-cyan)' }} />
        <div>
          <div className="tc-h1" style={{ fontSize: 24 }}>
            COMMAND<span style={{ color: 'var(--tc-cyan)' }}>//</span>OVERVIEW
          </div>
          <div className="tc-label">ADMIN CONSOLE · {new Date().toISOString().slice(0,10)}</div>
        </div>
      </header>

      <div className="tc-divider" />

      <div style={{ display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {cards.map(c => (
          <Link key={c.href} href={c.href} style={{ textDecoration: 'none' }}>
            <div className="tc-card" style={{ padding: 18, position: 'relative',
              borderColor: 'var(--tc-line2)', cursor: 'pointer' }}>
              <span className="corner tl" style={{ borderColor: c.accent }} />
              <span className="corner tr" style={{ borderColor: c.accent }} />
              <span className="corner bl" style={{ borderColor: c.accent }} />
              <span className="corner br" style={{ borderColor: c.accent }} />
              <div className="tc-h2" style={{ color: c.accent, marginBottom: 6 }}>
                ▸ {c.title}
              </div>
              <div className="tc-mono" style={{ fontSize: 12, color: 'var(--tc-text-dim)' }}>
                {c.desc}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
