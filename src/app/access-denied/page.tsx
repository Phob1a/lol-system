import { AuthCard } from '@/components/auth/AuthCard';
import { ArenaCta } from '@/components/public-arena';
import { Badge } from '@/components/ui/badge';

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
        <p className="text-sm text-slate-300">
          请使用具备相应权限的账户登录，例如管理员账号或队伍账号。
        </p>
        <div className="rounded border border-cyan-200/20 bg-slate-950/35 px-3 py-2 text-xs text-slate-300">
          <div className="font-mono text-[11px] uppercase text-cyan-100/70">
            err_code · ACCESS_DENIED
          </div>
          <p className="mt-1">如刚切换过系统版本，请先登出再重新登录。</p>
        </div>
      </div>
      <ArenaCta href="/api/auth/signout" variant="ghost" className="mt-5 w-full">
        登出
      </ArenaCta>
    </AuthCard>
  );
}
