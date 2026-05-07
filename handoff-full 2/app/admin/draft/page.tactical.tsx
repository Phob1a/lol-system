import { prisma } from '@/lib/db';
import { getDraftSnapshot } from '@/lib/draft/engine';
import { DraftControl } from '@/components/admin/DraftControl.tactical';

export default async function AdminDraftPage() {
  const session = await prisma.draftSession.findFirst({
    orderBy: { createdAt: 'desc' },
  }).catch(() => null);
  const snap = session ? await getDraftSnapshot(session.id).catch(() => null) : null;
  return <DraftControl initial={snap ?? { status: 'IDLE', teams: [], events: [] }} />;
}
