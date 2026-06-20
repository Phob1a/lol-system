'use client';

import { useEffect } from 'react';
import { ArenaPanel, PublicArenaShell } from '@/components/public-arena';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showDetails = process.env.NODE_ENV !== 'production';

  useEffect(() => {
    console.error('App error boundary caught:', error);
  }, [error]);

  return (
    <PublicArenaShell className="min-h-screen" contentClassName="min-h-screen justify-center">
      <ArenaPanel eyebrow="SYSTEM ERROR" title="页面出错了" className="mx-auto w-full max-w-md p-6">
        <p className="text-sm leading-6 text-slate-300">
          {showDetails
            ? error.message || '未知错误'
            : '系统遇到异常，请稍后重试；如问题持续，请联系管理员。'}
          {error.digest && (
            <span className="ml-2 font-mono text-xs text-cyan-100/70">
              digest: {error.digest}
            </span>
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded border border-cyan-200/45 bg-cyan-200 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(94,231,255,0.35)] transition hover:translate-y-[-1px]"
          >
            重试
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = '/')}
            className="rounded border border-cyan-200/25 bg-cyan-200/5 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:translate-y-[-1px]"
          >
            回到首页
          </button>
        </div>
      </ArenaPanel>
    </PublicArenaShell>
  );
}
