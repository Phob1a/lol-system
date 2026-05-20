import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';

export default function AccessDeniedPage() {
  return (
    <AuthCard title="访问被拒绝">
      <p className="text-sm text-muted-foreground">
        您的账户无权访问该页面。请使用具备相应权限的账户登录（管理员或队伍账号）。
        <br />
        err_code · ACCESS_DENIED · 如刚切换过系统版本，请先登出再重新登录
      </p>
      <Button asChild variant="outline" className="mt-4 w-full">
        <Link href="/api/auth/signout">登出</Link>
      </Button>
    </AuthCard>
  );
}
