import { prisma } from '@/lib/db';
import { ConfigForm } from '@/components/admin/ConfigForm';

export const dynamic = 'force-dynamic';

export default async function ConfigPage() {
  const config = await prisma.config.findUnique({ where: { id: 1 } });
  return (
    <ConfigForm
      teamBudget={config?.teamBudget ?? 1000}
      draftLocked={config?.draftLocked ?? false}
    />
  );
}
