import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const mustChange = session.user.mustChangePwd;
  const accent = mustChange ? 'var(--tc-red)' : 'var(--tc-cyan)';

  return (
    <div
      className="tc-board"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div className="tc-card" style={{ width: 460, padding: 32, position: 'relative' }}>
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ width: 4, height: 28, background: accent, boxShadow: `0 0 12px ${accent}` }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 20 }}>
              CHANGE<span style={{ color: 'var(--tc-cyan)' }}>{"//"}</span>PASSWORD
            </div>
            <div className="tc-label">
              {mustChange ? '⚠ FIRST LOGIN · ROTATION REQUIRED' : 'UPDATE TERMINAL CREDENTIAL'}
            </div>
          </div>
        </header>

        {mustChange && (
          <div
            style={{
              margin: '14px 0 18px',
              padding: '8px 12px',
              background: 'rgba(255,61,92,0.08)',
              borderLeft: '3px solid var(--tc-red)',
              fontFamily: 'var(--tc-font-mono)',
              fontSize: 11,
              color: 'var(--tc-red)',
            }}
          >
            默认密码必须修改。完成后才能进入系统。
          </div>
        )}

        <div className="tc-divider" style={{ margin: '14px 0' }} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
