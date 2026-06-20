import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import AuditLogView from '@/components/admin/AuditLogView';
import type { AuditEventRow, AuditActorRow } from '@/components/admin/AuditLogView';

export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = {
  DRAFT_STARTED:   '选秀启动',
  ROUND_STARTED:   '轮次启动',
  PICK_MADE:       '出手',
  PICK_REVOKED:    '撤销 pick',
  ROUND_REWOUND:   '回退一轮',
  DRAFT_RESET:     '重置选秀',
  SLOT_REARRANGED: '位置调整',
  ORDER_SET:       '设置顺序',
};

export default async function AuditPage() {
  const tournament = await getActiveTournament(prisma);

  if (!tournament) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-mono text-[12px] text-nexus-faint">暂无赛事</p>
      </div>
    );
  }

  const rawEvents = await prisma.draftEvent.findMany({
    where: { session: { tournamentId: tournament.id } },
    orderBy: { seq: 'desc' },
    take: 200,
  });

  const userIds = Array.from(new Set(rawEvents.map((e) => e.actorId)));
  const rawUsers = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, role: true },
  });

  // Serialise Date → ISO string before passing across server/client boundary.
  const events: AuditEventRow[] = rawEvents.map((e) => ({
    id:        e.id,
    seq:       e.seq,
    type:      e.type,
    actorId:   e.actorId,
    payload:   e.payload,
    createdAt: e.createdAt.toISOString(),
  }));

  const actors: AuditActorRow[] = rawUsers;

  return (
    <AuditLogView
      events={events}
      actors={actors}
      eventLabels={EVENT_LABEL}
    />
  );
}
