import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { AuthCard } from '@/components/auth/AuthCard';
import { RegistrationForm } from '@/components/registration/RegistrationForm';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const season = await getActiveSeason(prisma);
  if (season?.status !== 'REGISTRATION') {
    return (
      <AuthCard
        title="报名未开放"
        description={season ? '本赛季报名已截止或未开放。' : '当前没有开放报名的赛季。'}
        centered={false}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            请关注赛事通知；开放报名后可再次回到此页面提交信息。
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">回到首页</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  return <RegistrationForm seasonName={season.name} />;
}
