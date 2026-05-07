'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const [gameId, setGameId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    const res = await signIn('credentials', { gameId, password, redirect: false });
    setLoading(false);
    if (res?.error) { setErr('登录失败：账号或密码错误'); return; }
    router.push(callbackUrl);
    router.refresh();
  };

  const clock = new Date().toTimeString().slice(0, 8);

  return (
    <div className="tc-board" style={{ minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={onSubmit} className="tc-card"
        style={{ width: 460, padding: 36, position: 'relative' }}>
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 4, height: 28, background: 'var(--tc-cyan)',
            boxShadow: '0 0 12px var(--tc-cyan)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              DRAFT<span style={{ color: 'var(--tc-cyan)' }}>//</span>OPS
            </div>
            <div className="tc-label">SECURE TERMINAL</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="GAME ID" value={gameId} onChange={setGameId}
            placeholder="enter handle…" autoFocus />
          <Field label="PASSWORD" value={password} onChange={setPassword}
            type="password" hint="default: lol2026 · forced rotation on first login" />
        </div>

        {err && (
          <div style={{ marginTop: 12, padding: '6px 10px',
            background: 'rgba(255,61,92,0.08)', borderLeft: '3px solid var(--tc-red)',
            fontFamily: 'var(--tc-font-mono)', fontSize: 11, color: 'var(--tc-red)' }}>
            ⚠ {err}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="tc-btn tc-btn-primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 22,
            opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? '▸ AUTHENTICATING…' : '▸ AUTHENTICATE'}
        </button>

        <div className="tc-divider" style={{ margin: '20px 0 12px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-faint)' }}>
            <span style={{ color: 'var(--tc-green)' }}>●</span> POSTGRES OK · TLS 1.3
          </span>
          <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-faint)' }}>{clock}</span>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, hint, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string; autoFocus?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="tc-label">{label}</span>
      <input type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} className="tc-mono"
        style={{
          background: 'var(--tc-bg-0)', color: 'var(--tc-text)',
          border: '1px solid var(--tc-line2)',
          padding: '8px 10px', fontSize: 13, letterSpacing: 1, outline: 'none',
        }} />
      {hint && <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-text-faint)' }}>{hint}</span>}
    </label>
  );
}
