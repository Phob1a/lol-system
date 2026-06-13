'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { getPostAuthRedirect } from '@/lib/auth-landing';

export function ChangePasswordForm() {
  const router = useRouter();
  const { data: session, update } = useSession();
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
    const role = session?.user.role ?? 'ADMIN';
    router.push(getPostAuthRedirect({ role }));
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">当前密码</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">新密码（至少 6 位）</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
          onChange={(e) => evalStrength(e.target.value)}
        />
        <div className="mt-1.5 flex gap-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-sm ${i <= strength ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          强度：{strengthLabel}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">确认新密码</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>

      <Button type="submit" className="mt-2 w-full" disabled={submitting}>
        <LoadingButtonContent loading={submitting} loadingText="更新中…">
          更新密码
        </LoadingButtonContent>
      </Button>
    </form>
  );
}
