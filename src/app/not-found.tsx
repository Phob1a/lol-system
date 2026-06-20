import { ArenaCta, ArenaEmptyState, PublicArenaShell } from '@/components/public-arena';

export default function NotFound() {
  return (
    <PublicArenaShell className="min-h-screen" contentClassName="min-h-screen justify-center">
      <ArenaEmptyState
        eyebrow="ROUTE NOT FOUND"
        title="页面不存在"
        description="请检查链接是否正确，或返回公开入口重新进入。"
        action={
          <ArenaCta href="/">回到首页</ArenaCta>
        }
      />
    </PublicArenaShell>
  );
}
