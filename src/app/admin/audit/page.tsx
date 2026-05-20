import { prisma } from '@/lib/db';
import { getActiveSeason } from '@/lib/season/season-service';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = {
  DRAFT_STARTED: '选秀启动',
  ROUND_STARTED: '轮次启动',
  PICK_MADE: '出手',
  PICK_REVOKED: '撤销 pick',
  ROUND_REWOUND: '回退一轮',
  DRAFT_RESET: '重置选秀',
  SLOT_REARRANGED: '位置调整',
  ORDER_SET: '设置顺序',
};

export default async function AuditPage() {
  const season = await getActiveSeason(prisma);

  if (!season) {
    return (
      <div>
        <p className="text-muted-foreground">暂无赛季</p>
      </div>
    );
  }

  const events = await prisma.draftEvent.findMany({
    where: { session: { seasonId: season.id } },
    orderBy: { seq: 'desc' },
    take: 200,
  });

  const userIds = Array.from(new Set(events.map((e) => e.actorId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, role: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="审计日志" description="当前赛季选秀事件流" />

      {events.length === 0 ? (
        <p className="text-muted-foreground">暂无事件 · 启动选秀后将在此记录</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SEQ</TableHead>
              <TableHead>TIMESTAMP</TableHead>
              <TableHead>TYPE</TableHead>
              <TableHead>ACTOR</TableHead>
              <TableHead>PAYLOAD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => {
              const actor = userById.get(e.actorId);
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">#{e.seq}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(e.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{EVENT_LABEL[e.type] ?? e.type}</Badge>
                  </TableCell>
                  <TableCell>
                    {actor?.username ?? e.actorId.slice(0, 6)}
                    {actor && (
                      <span className="ml-1 text-muted-foreground">· {actor.role}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">
                    {typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload ?? {})}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
