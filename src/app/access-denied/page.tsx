import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function AccessDeniedPage() {
  return (
    <AuthCard title="访问被拒绝" description="当前账户没有访问该页面所需的权限。">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-mono">
            ACCESS_DENIED
          </Badge>
          <Badge variant="secondary">权限不足</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          请使用具备相应权限的账户登录，例如管理员账号或队伍账号。
        </p>
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="font-mono text-[11px] uppercase text-muted-foreground/80">
            err_code · ACCESS_DENIED
          </div>
          <p className="mt-1">如刚切换过系统版本，请先登出再重新登录。</p>
        </div>
      </div>
      <Button asChild variant="outline" className="mt-4 w-full">
        <Link href="/api/auth/signout">登出</Link>
      </Button>
    </AuthCard>
  );
}
