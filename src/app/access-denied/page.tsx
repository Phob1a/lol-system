import Link from 'next/link';

export default function AccessDeniedPage() {
  return (
    <div
      className="tc-board"
      style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div className="tc-card" style={{ width: 460, padding: 32, position: 'relative' }}>
        <span className="corner tl" style={{ borderColor: 'var(--tc-red)' }} />
        <span className="corner tr" style={{ borderColor: 'var(--tc-red)' }} />
        <span className="corner bl" style={{ borderColor: 'var(--tc-red)' }} />
        <span className="corner br" style={{ borderColor: 'var(--tc-red)' }} />

        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 4, height: 28, background: 'var(--tc-red)', boxShadow: '0 0 12px var(--tc-red)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 20, color: 'var(--tc-red)' }}>
              ACCESS<span style={{ color: 'var(--tc-text)' }}>{'//'}</span>DENIED
            </div>
            <div className="tc-label">UNAUTHORIZED · SECURITY POLICY</div>
          </div>
        </header>

        <div
          style={{
            margin: '12px 0 18px',
            padding: '10px 12px',
            background: 'rgba(255,61,92,0.08)',
            borderLeft: '3px solid var(--tc-red)',
            fontFamily: 'var(--tc-font-mono)',
            fontSize: 11,
            color: 'var(--tc-text-dim)',
            lineHeight: 1.6,
          }}
        >
          您的账户无权访问该页面。请使用具备相应权限的账户登录（管理员或队伍账号）。
          <br />
          <span style={{ color: 'var(--tc-text-faint)' }}>err_code · ACCESS_DENIED · 如刚切换过系统版本，请先登出再重新登录</span>
        </div>

        <div className="tc-divider" style={{ margin: '0 0 14px' }} />

        <Link href="/api/auth/signout" className="tc-btn" style={{ width: '100%', justifyContent: 'center' }}>
          ▸ SIGN OUT
        </Link>
      </div>
    </div>
  );
}
