import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const season = await getActiveSeason(prisma);

  const [registrationCount, captainCount, draftSession] = season
    ? await Promise.all([
        prisma.registration.count({ where: { seasonId: season.id, status: 'ACTIVE' } }),
        prisma.registration.count({
          where: { seasonId: season.id, status: 'ACTIVE', isCaptain: true },
        }),
        prisma.draftSession.findUnique({ where: { seasonId: season.id } }),
      ])
    : [0, 0, null];

  const draftStatus = draftSession?.status ?? 'NOT_STARTED';

  const cards = [
    {
      href: '/admin/season',
      title: 'SEASON',
      desc: season
        ? `${season.name} · ${season.status} · 预算 ${season.teamBudget} CR`
        : '尚无赛季 · 点击创建',
      accent: 'var(--tc-amber)',
    },
    {
      href: '/admin/registrations',
      title: 'REGISTRATIONS',
      desc: season
        ? `${registrationCount} 报名 · ${captainCount} 意向队长`
        : '需要先创建赛季',
      accent: 'var(--tc-cyan)',
    },
    {
      href: '/admin/draft',
      title: 'DRAFT',
      desc: draftStatus,
      accent:
        draftStatus === 'IN_PROGRESS'
          ? 'var(--tc-green)'
          : draftStatus === 'FINISHED'
          ? 'var(--tc-purple)'
          : 'var(--tc-text-faint)',
    },
    { href: '/admin/audit', title: 'AUDIT', desc: '事件日志 · seq monotonic', accent: 'var(--tc-purple)' },
  ];

  return (
    <div
      className="tc-board"
      style={{ minHeight: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 4,
            height: 30,
            background: 'var(--tc-cyan)',
            boxShadow: '0 0 12px var(--tc-cyan)',
          }}
        />
        <div>
          <div className="tc-h1" style={{ fontSize: 24 }}>
            COMMAND<span style={{ color: 'var(--tc-cyan)' }}>{"//"}</span>OVERVIEW
          </div>
          <div className="tc-label">ADMIN CONSOLE · {new Date().toISOString().slice(0, 10)}</div>
        </div>
      </header>

      <div className="tc-divider" />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        {cards.map((c) => (
          <Link key={c.href} href={c.href} style={{ textDecoration: 'none' }}>
            <div
              className="tc-card"
              style={{ padding: 18, position: 'relative', borderColor: 'var(--tc-line2)', cursor: 'pointer' }}
            >
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
