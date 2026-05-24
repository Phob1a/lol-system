'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await signIn('credentials', {
        username: username.trim(),
        password,
        redirect: false,
      });
      if (!res || res.error) {
        setErr('登录失败：账号或密码错误');
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } finally {
      // Keep the submit button disabled until after setErr lands, so a
      // failed attempt can't be re-submitted in the gap between the
      // network return and the error render.
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">账号</Label>
        <Input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="例：admin"
          autoFocus
          autoComplete="username"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      {err && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">{err}</p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? '登录中…' : '登录'}
      </Button>
    </form>
  );
}
