'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

export function ChangePasswordForm() {
  const router = useRouter();
  const { update } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [strength, setStrength] = useState(0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const newPwd = String(data.get('newPassword') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    if (newPwd !== confirm) {
      toast.error('两次输入的新密码不一致');
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: String(data.get('currentPassword') ?? ''),
        newPassword: newPwd,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      toast.error(body.error ?? '修改失败');
      return;
    }
    toast.success('密码已更新');
    await update({ mustChangePwd: false });
    router.push('/');
    router.refresh();
  }

  function evalStrength(s: string) {
    let n = 0;
    if (s.length >= 6) n++;
    if (s.length >= 10) n++;
    if (/[A-Z]/.test(s) && /[a-z]/.test(s)) n++;
    if (/\d/.test(s) && /[^A-Za-z0-9]/.test(s)) n++;
    setStrength(n);
  }

  const strengthLabel = ['—', 'WEAK', 'OK', 'STRONG', 'HARDENED'][strength];
  const strengthColor = [
    'var(--tc-line2)',
    'var(--tc-red)',
    'var(--tc-amber)',
    'var(--tc-cyan)',
    'var(--tc-green)',
  ][strength];

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PwField name="currentPassword" label="CURRENT PASSWORD" autoComplete="current-password" required />

      <div>
        <PwField
          name="newPassword"
          label="NEW PASSWORD (≥6)"
          autoComplete="new-password"
          minLength={6}
          required
          onChange={(e) => evalStrength(e.target.value)}
        />
        <div style={{ marginTop: 6, display: 'flex', gap: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                background: i <= strength ? strengthColor : 'var(--tc-line)',
              }}
            />
          ))}
        </div>
        <div className="tc-mono" style={{ fontSize: 9, marginTop: 3, color: strengthColor, letterSpacing: 1.5 }}>
          STRENGTH · {strengthLabel}
        </div>
      </div>

      <PwField name="confirm" label="CONFIRM NEW PASSWORD" autoComplete="new-password" minLength={6} required />

      <button
        type="submit"
        className="tc-btn tc-btn-primary"
        style={{ justifyContent: 'center', marginTop: 6 }}
        disabled={submitting}
      >
        {submitting ? '▸ UPDATING…' : '▸ UPDATE PASSWORD'}
      </button>
    </form>
  );
}

const PwField = ({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span className="tc-label">{label}</span>
    <input
      type="password"
      {...rest}
      className="tc-mono"
      style={{
        background: 'var(--tc-bg-0)',
        color: 'var(--tc-text)',
        border: '1px solid var(--tc-line2)',
        padding: '8px 10px',
        fontSize: 13,
        letterSpacing: 2,
        outline: 'none',
      }}
    />
  </label>
);
