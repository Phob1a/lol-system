import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArenaCta, ArenaEmptyState, ArenaPanel } from '@/components/public-arena';

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
  const tournament = await getActiveTournament(prisma);

  if (!tournament) {
    return (
      <ArenaEmptyState
        eyebrow="AUDIT OFFLINE"
        title="暂无赛事"
        description="创建赛事后，选秀事件会在这里形成审计时间线。"
        action={<ArenaCta href="/admin/tournament">前往赛事管理</ArenaCta>}
      />
    );
  }

  const events = await prisma.draftEvent.findMany({
    where: { session: { tournamentId: tournament.id } },
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
      <ArenaPanel eyebrow="EVENT TRACE" title="审计日志" className="p-5">
        <p className="text-sm leading-6 text-slate-300">
          当前赛事选秀事件流。系统按 seq 倒序展示关键操作、操作者和 payload。
        </p>
      </ArenaPanel>

      {events.length === 0 ? (
        <ArenaEmptyState
          eyebrow="NO EVENTS"
          title="暂无事件"
          description="启动选秀后，这里会记录轮次启动、出手、撤销和顺序调整。"
        />
      ) : (
        <ArenaPanel className="p-3">
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
        </ArenaPanel>
      )}
    </div>
  );
}
