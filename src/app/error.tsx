'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error boundary caught:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>页面出错了</CardTitle>
          <CardDescription>
            {error.message || '未知错误'}
            {error.digest && (
              <span className="ml-2 font-mono text-xs">(digest: {error.digest})</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => reset()}>重试</Button>
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            回到首页
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
