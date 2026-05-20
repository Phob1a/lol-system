import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const season = await getActiveSeason(prisma);
  return NextResponse.json({
    open: season?.status === 'REGISTRATION',
    seasonName: season?.name ?? null,
  });
}
