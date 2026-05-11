'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

export function CaptainNav({ gameId, nickname }: { gameId: string; nickname: string }) {
  return (
    <nav
      style={{
        borderBottom: '1px solid var(--tc-line)',
        background: 'linear-gradient(180deg, rgba(14,20,34,0.96), rgba(7,8,12,0.92))',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <div
        style={{
          maxWidth: 1600,
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 22, background: 'var(--tc-cyan)', boxShadow: '0 0 12px var(--tc-cyan)' }} />
          <span className="tc-display" style={{ fontSize: 16, color: 'var(--tc-text)' }}>
            DRAFT<span style={{ color: 'var(--tc-cyan)' }}>{'//'}</span>BAY
          </span>
          <span className="tc-chip" style={{ marginLeft: 4 }}>CAPTAIN</span>
        </div>

        <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {[{ href: '/tournament', label: '赛事' }].map((it) => {
            const active = pathname === it.href || pathname?.startsWith(it.href + '/');
            return (
              <Link
                key={it.href}
                href={it.href}
                style={{
                  padding: '6px 14px',
                  textDecoration: 'none',
                  fontFamily: 'var(--tc-font-display)',
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: active ? 'var(--tc-bg-0)' : 'var(--tc-text-dim)',
                  background: active ? 'var(--tc-cyan)' : 'transparent',
                  border: `1px solid ${active ? 'var(--tc-cyan)' : 'var(--tc-line2)'}`,
                  boxShadow: active ? '0 0 12px rgba(0,229,255,0.4)' : undefined,
                  transition: 'all .12s',
                }}
              >
                {it.label}
              </Link>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="tc-display" style={{ fontSize: 13, color: 'var(--tc-text)' }}>
            {nickname}
          </span>
          <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-cyan)' }}>
            @{gameId}
          </span>
          <span className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
            <span style={{ color: 'var(--tc-green)' }}>●</span> SESSION_OK
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="tc-btn"
            style={{ padding: '4px 12px', fontSize: 10 }}
          >
            ▸ SIGN OUT
          </button>
        </div>
      </div>
    </nav>
  );
}
