import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getActiveTournament } from '@/lib/tournament/tournament-service';
import { getAdminOverviewStats } from '@/lib/admin/overview-stats';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import DTile from '@/components/nexus/DTile';
import Kicker from '@/components/nexus/Kicker';
import Readout from '@/components/nexus/Readout';
import Chip, { type ChipVariant } from '@/components/nexus/Chip';
import LiveDot from '@/components/nexus/LiveDot';
import NexusButton from '@/components/nexus/NexusButton';
import { Sparkline } from '@/components/nexus/charts/Sparkline';

export const dynamic = 'force-dynamic';

// Tone map mirrors AuditLogView / admin.jsx ACT_TONE.
const ACT_TONE: Record<string, ChipVariant> = {
  DRAFT_STARTED: 'ac',
  PICK_MADE: 'ac',
  ROUND_STARTED: 'default',
  ORDER_SET: 'default',
  SLOT_REARRANGED: 'default',
  PICK_REVOKED: 'hot',
  ROUND_REWOUND: 'hot',
  DRAFT_RESET: 'hot',
};

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

function actTone(type: string): ChipVariant {
  return ACT_TONE[type] ?? 'default';
}

function fmtTs(d: Date): string {
  return d.toISOString().slice(5, 16).replace('T', ' ');
}

export default async function AdminHomePage() {
  const tournament = await getActiveTournament(prisma);

  if (!tournament) {
    return (
      <div className="flex flex-col gap-4">
        <Panel className="px-5 py-4">
          <Kicker className="mb-1.5">OPS CONTROL · 运维控制台</Kicker>
          <div className="font-display text-2xl text-nexus-ink">概览</div>
          <p className="mt-2 text-[11px] text-nexus-faint">尚无赛事 · 点击创建</p>
        </Panel>
        <div>
          <Link href="/admin/tournament">
            <NexusButton>前往赛事管理</NexusButton>
          </Link>
        </div>
      </div>
    );
  }

  const overviewStats = await getAdminOverviewStats(prisma, tournament.id);

  // Funnel + activity derive from the same store the audit page reads; no new
  // service APIs are introduced.
  const [teams, rawEvents] = await Promise.all([
    prisma.team.findMany({
      where: { tournamentId: tournament.id },
      select: { slots: { select: { registrationId: true } } },
    }),
    prisma.draftEvent.findMany({
      where: { session: { tournamentId: tournament.id } },
      orderBy: { seq: 'desc' },
      take: 8,
    }),
  ]);

  const actorIds = Array.from(new Set(rawEvents.map((e) => e.actorId)));
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, username: true },
  });
  const actorById = new Map(actors.map((a) => [a.id, a.username]));

  const registered = overviewStats.registrationCount;
  const captainIntent = overviewStats.captainIntentionCount;
  const drafted = teams.reduce(
    (acc, t) => acc + t.slots.filter((s) => s.registrationId).length,
    0,
  );

  const funnel: Array<[string, number, 'ac' | 'accent-2' | 'gold' | 'good']> = [
    ['提交报名', registered, 'ac'],
    ['进入选秀池', registered, 'accent-2'],
    ['已被选秀', drafted, 'gold'],
    ['锁定首发', drafted, 'good'],
  ];
  const funnelMax = Math.max(registered, 1);
  const funnelBar: Record<string, string> = {
    ac: 'rgb(var(--accent-n) / 0.8)',
    'accent-2': 'rgb(var(--accent-n2) / 0.8)',
    gold: 'rgb(var(--gold) / 0.8)',
    good: 'rgb(var(--good) / 0.8)',
  };
  const funnelText: Record<string, string> = {
    ac: 'text-nexus-accent',
    'accent-2': 'text-nexus-accent-2',
    gold: 'text-nexus-gold',
    good: 'text-nexus-good',
  };

  return (
    <div className="flex flex-col gap-[18px]">
      {/* command header */}
      <Panel glow className="flex flex-wrap items-center justify-between gap-4 px-5 py-[18px]">
        <div>
          <Kicker className="mb-1.5">OPS CONTROL · 运维控制台</Kicker>
          <div className="font-display text-[26px] leading-tight text-nexus-ink">
            {tournament.name} · 运维概览
          </div>
          <div className="mt-1.5 text-[11px] text-nexus-faint">
            状态 {tournament.status} · 选秀 {overviewStats.draftStatus} · 预算 {tournament.teamBudget} CR
          </div>
        </div>
        <div className="flex gap-2.5">
          <Link href="/admin/registrations">
            <NexusButton>报名审核</NexusButton>
          </Link>
          <Link href="/admin/draft">
            <NexusButton variant="primary">选秀控制</NexusButton>
          </Link>
        </div>
      </Panel>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DTile label="总报名" value={registered} sub={`队长意向 ${captainIntent}`}>
          <div className="absolute right-4 top-[14px]">
            <Sparkline data={[12, 18, 24, 30, 38, 44, registered || 46]} w={64} h={20} color="rgb(var(--accent-n))" dot />
          </div>
        </DTile>
        <DTile label="队长意向" value={captainIntent} sub="可任命队长">
          <div className="absolute right-4 top-[14px]">
            <Sparkline data={[1, 2, 3, 4, 5, 6, captainIntent || 6]} w={64} h={20} color="rgb(var(--accent-n2))" dot />
          </div>
        </DTile>
        <DTile label="已被选秀" value={drafted} sub="进入战队">
          <div className="absolute right-4 top-[14px]">
            <Sparkline data={[0, 4, 10, 18, 26, 33, drafted || 38]} w={64} h={20} color="rgb(var(--good))" dot />
          </div>
        </DTile>
        <DTile
          label="选秀状态"
          value={overviewStats.draftStatus === 'IN_PROGRESS' ? 'LIVE' : overviewStats.draftStatus}
        >
          <p className="mt-1 font-mono text-[10px] text-nexus-dim">数据链路稳定</p>
        </DTile>
      </div>

      {/* funnel + activity */}
      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHead
            title="FUNNEL · 报名漏斗"
            actions={<Readout className="text-[10px] text-nexus-faint">SUBMIT → ROSTER</Readout>}
          />
          <div className="grid gap-3 p-[18px]">
            {funnel.map(([label, val, tone]) => (
              <div key={label}>
                <div className="mb-[5px] flex justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-dim">
                    {label}
                  </span>
                  <Readout className={`text-[12px] font-bold ${funnelText[tone]}`}>{val}</Readout>
                </div>
                <div className="relative h-2 overflow-hidden border border-nexus-line bg-nexus-panel-2">
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${(val / funnelMax) * 100}%`, background: funnelBar[tone] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel scan>
          <PanelHead title="AUDIT · 近期操作流" actions={<LiveDot />} />
          <div className="max-h-80 overflow-auto py-1.5">
            {rawEvents.length === 0 && (
              <div className="px-4 py-7 text-center font-mono text-[11px] text-nexus-faint">
                暂无操作记录
              </div>
            )}
            {rawEvents.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[auto_1fr] gap-2.5 border-b border-nexus-line/35 px-4 py-[9px]"
              >
                <Chip variant={actTone(e.type)} className="mt-px self-start">
                  {e.type.replace(/_/g, ' ')}
                </Chip>
                <div className="min-w-0">
                  <div className="text-[12.5px] leading-snug text-nexus-ink">
                    {EVENT_LABEL[e.type] ?? e.type}
                  </div>
                  <Readout className="mt-0.5 text-[9.5px] text-nexus-faint">
                    {actorById.get(e.actorId) ?? 'system'} · {fmtTs(e.createdAt)}
                  </Readout>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
