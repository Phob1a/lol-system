'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  DndContext,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import type { AdminState } from '@/hooks/useTournamentState';
import type { GroupKnockoutConfig } from '@/lib/tournament/types';
import {
  applyGroupDrop,
  getUnassignedTeamIds,
  type GroupDragSource,
  type GroupDropTarget,
} from '@/lib/tournament/group-assignment-drag';
import { cn } from '@/lib/utils';

type Team = { id: string; name: string };

type Props = {
  teams: Team[];
  state: AdminState;
  refetch: () => Promise<void>;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const slotFirstCollisionDetection: CollisionDetection = (args) => {
  const collisions = rectIntersection(args);
  const slotCollisions = collisions.filter(({ id }) => String(id).startsWith('group-slot-'));
  return slotCollisions.length > 0 ? slotCollisions : collisions;
};

export function GroupsTab({ teams, state, refetch }: Props) {
  const [assignments, setAssignments] = useState<string[][]>([]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const tournament = state?.tournament ?? null;
  const standings = useMemo(() => state?.standings ?? [], [state?.standings]);
  const isSetup = tournament?.status === 'SETUP';

  const config = tournament?.config as GroupKnockoutConfig | null | undefined;
  const groupCount = config?.groupCount ?? (standings.length > 0 ? standings.length : 2);
  const teamsPerGroup = config?.teamsPerGroup ?? (standings.length > 0
    ? Math.max(...standings.map((g) => Object.keys(g.teams).length), 1)
    : 4);

  useEffect(() => {
    if (standings.length > 0) {
      setAssignments(standings.map((g) => Object.keys(g.teams)));
    } else {
      setAssignments(Array.from({ length: groupCount }, () => Array(teamsPerGroup).fill('')));
    }
  }, [groupCount, teamsPerGroup, standings]);

  if (!tournament) {
    return (
      <div className="pt-4 text-muted-foreground text-sm">请先在「设置」tab 创建赛事。</div>
    );
  }

  if (!isSetup) {
    return (
      <div className="space-y-4 pt-4">
        <p className="text-sm text-muted-foreground">分组已锁定（状态：{tournament.status}）。</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {standings.map((g) => (
            <div key={g.groupId} className="rounded-md border p-4 space-y-2">
              <h3 className="text-sm font-semibold">{g.name}</h3>
              <ul className="space-y-1">
                {Object.entries(g.teams).map(([id, name]) => (
                  <li key={id} className="text-sm text-muted-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function handleRandomize() {
    const shuffled = shuffle(teams);
    const result: string[][] = [];
    let cursor = 0;
    for (let g = 0; g < groupCount; g++) {
      const row: string[] = [];
      for (let s = 0; s < teamsPerGroup; s++) {
        row.push(shuffled[cursor]?.id ?? '');
        cursor++;
      }
      result.push(row);
    }
    setAssignments(result);
  }

  function buildAssignmentsPayload() {
    return standings.map((g, gi) => ({
      groupId: g.groupId,
      teamIds: (assignments[gi] ?? []).filter(Boolean),
    }));
  }

  function handleDragEnd(event: DragEndEvent) {
    const source = event.active.data.current as GroupDragSource | undefined;
    const target = event.over?.data.current as GroupDropTarget | undefined;
    if (!source || !target) return;
    setAssignments((prev) => applyGroupDrop(prev, source, target));
  }

  async function handleSave() {
    if (!tournament) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tournament/admin/groups', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tournament.id,
          assignments: buildAssignmentsPayload(),
        }),
      });
      if (res.ok) {
        toast.success('分组已保存');
        await refetch();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '保存失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    if (!tournament) return;
    setConfirming(true);
    try {
      const putRes = await fetch('/api/tournament/admin/groups', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tournament.id,
          assignments: buildAssignmentsPayload(),
        }),
      });
      if (!putRes.ok) {
        const data = await putRes.json().catch(() => ({}));
        toast.error(data.error ?? '保存分组失败');
        return;
      }
      const postRes = await fetch('/api/tournament/admin/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tournamentId: tournament.id }),
      });
      if (postRes.ok) {
        toast.success('分组已确认，对阵已生成');
        await refetch();
      } else {
        const data = await postRes.json().catch(() => ({}));
        toast.error(data.error ?? '确认失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '确认失败');
    } finally {
      setConfirming(false);
    }
  }

  const groupNames =
    standings.length > 0
      ? standings.map((g) => g.name)
      : Array.from({ length: groupCount }, (_, i) => `第 ${i + 1} 组`);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const unassignedIds = getUnassignedTeamIds(teams.map((t) => t.id), assignments);

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleRandomize}>
          随机分组
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          <LoadingButtonContent loading={saving} loadingText="保存中…">
            保存分组
          </LoadingButtonContent>
        </Button>
        <Button
          size="sm"
          disabled={confirming}
          onClick={() => void handleConfirm()}
        >
          <LoadingButtonContent loading={confirming} loadingText="确认中…">
            确认分组并生成对阵
          </LoadingButtonContent>
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={slotFirstCollisionDetection}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
          <TeamPool teams={unassignedIds.map((id) => teamById.get(id)).filter((t): t is Team => !!t)} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: groupCount }, (_, gi) => (
              <GroupColumn
                key={gi}
                groupIdx={gi}
                name={groupNames[gi] ?? `第 ${gi + 1} 组`}
                assignedCount={(assignments[gi] ?? []).filter(Boolean).length}
                teamsPerGroup={teamsPerGroup}
              >
                {Array.from({ length: teamsPerGroup }, (_, si) => {
                  const teamId = assignments[gi]?.[si] ?? '';
                  return (
                    <GroupSlot
                      key={si}
                      groupIdx={gi}
                      slotIdx={si}
                      team={teamId ? teamById.get(teamId) ?? null : null}
                    />
                  );
                })}
              </GroupColumn>
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function GroupColumn({
  groupIdx,
  name,
  assignedCount,
  teamsPerGroup,
  children,
}: {
  groupIdx: number;
  name: string;
  assignedCount: number;
  teamsPerGroup: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-column-${groupIdx}`,
    data: { type: 'group', groupIdx } satisfies GroupDropTarget,
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`group-column-${groupIdx}`}
      className={cn(
        'space-y-3 rounded-md border p-4 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{name}</h3>
        <span className="text-xs text-muted-foreground">
          {assignedCount}/{teamsPerGroup}
        </span>
      </div>
      {children}
    </div>
  );
}

function TeamPool({ teams }: { teams: Team[] }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'group-team-pool',
    data: { type: 'pool' } satisfies GroupDropTarget,
  });

  return (
    <section
      ref={setNodeRef}
      data-testid="group-team-pool"
      className={cn(
        'space-y-2 rounded-md border border-dashed p-3 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">未分配队伍</h3>
        <span className="text-xs text-muted-foreground">{teams.length}</span>
      </div>
      <div className="space-y-2">
        {teams.map((team) => (
          <DraggableTeamCard key={team.id} team={team} source={{ teamId: team.id, from: 'pool' }} />
        ))}
        {teams.length === 0 && (
          <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
            已全部分配
          </div>
        )}
      </div>
    </section>
  );
}

function GroupSlot({
  groupIdx,
  slotIdx,
  team,
}: {
  groupIdx: number;
  slotIdx: number;
  team: Team | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-slot-${groupIdx}-${slotIdx}`,
    data: { type: 'slot', groupIdx, slotIdx } satisfies GroupDropTarget,
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`group-slot-${groupIdx}-${slotIdx}`}
      className={cn(
        'min-h-12 rounded-md border border-dashed p-2 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      {team ? (
        <DraggableTeamCard
          team={team}
          source={{ teamId: team.id, from: 'slot', groupIdx, slotIdx }}
        />
      ) : (
        <div className="flex h-8 items-center justify-center text-xs text-muted-foreground">
          拖入队伍
        </div>
      )}
    </div>
  );
}

function DraggableTeamCard({ team, source }: { team: Team; source: GroupDragSource }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `group-team-${team.id}`,
    data: source,
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`group-team-card-${team.id}`}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-md border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50',
        'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      {team.name}
    </div>
  );
}
