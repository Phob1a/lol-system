import { prisma } from '@/lib/db';
import { ConfigForm } from '@/components/admin/ConfigForm.tactical';

export default async function ConfigPage() {
  const cfg = await prisma.config.findFirst();
  const draft = await prisma.draftSession.findFirst({
    where: { status: { in: ['STARTED', 'IN_PROGRESS'] as any } },
  }).catch(() => null);

  return (
    <ConfigForm
      initial={{
        teamBudget: cfg?.teamBudget ?? 1000,
        rounds:     cfg?.rounds     ?? 4,
        pickClock:  cfg?.pickClock  ?? 45,
        minBid:     cfg?.minBid     ?? 50,
        maxBid:     cfg?.maxBid     ?? 500,
      }}
      locked={!!draft}
    />
  );
}
