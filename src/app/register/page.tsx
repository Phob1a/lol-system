import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { RegistrationForm } from '@/components/registration/RegistrationForm';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const season = await getActiveSeason(prisma);
  if (season?.status !== 'REGISTRATION') {
    return (
      <div className="text-center text-muted-foreground">
        {season ? '本赛季报名已截止或未开放' : '当前没有开放报名的赛季'}
      </div>
    );
  }
  return <RegistrationForm seasonName={season.name} />;
}
