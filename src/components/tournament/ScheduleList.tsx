'use client';

import { useState } from 'react';
import type { PublicState } from '@/hooks/useTournamentState';
import { groupMatchesByDay } from '@/lib/tournament/schedule-grouping';
import { useMatchDrawer } from '@/components/tournament/MatchDetailProvider';
import { Countdown } from '@/components/nexus/charts/Countdown';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Chip from '@/components/nexus/Chip';
import Readout from '@/components/nexus/Readout';
import LiveDot from '@/components/nexus/LiveDot';
import Kicker from '@/components/nexus/Kicker';

type Match = NonNullable<PublicState>['matches'][number];
type Standing = NonNullable<PublicState>['standings'][number];

type Props = {
  matches: Match[];
  /** Optional standings used to build group filter pills. */
  standings?: Standing[];
};

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

type StageFilter = 'ALL' | 'GROUP' | 'KO';
type StatusFilter = 'ALL' | 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED';

function FilterBar({
  standings,
  stage,
  setStage,
  groupId,
  setGroupId,
  status,
  setStatus,
}: {
  standings: Standing[];
  stage: StageFilter;
  setStage: (v: StageFilter) => void;
  groupId: string | 'ALL';
  setGroupId: (v: string | 'ALL') => void;
  status: StatusFilter;
  setStatus: (v: StatusFilter) => void;
}) {
  const stageOptions: Array<[StageFilter, string]> = [
    ['ALL', '全部'],
    ['GROUP', '小组赛'],
    ['KO', '淘汰赛'],
  ];

  const statusOptions: Array<[StatusFilter, string]> = [
    ['ALL', '全部'],
    ['SCHEDULED', '未开始'],
    ['IN_PROGRESS', 'LIVE'],
    ['FINISHED', '已结束'],
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Stage filter */}
      <div className="flex gap-1.5 flex-wrap">
        {stageOptions.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setStage(k);
              if (k !== 'GROUP') setGroupId('ALL');
            }}
            className={[
              'font-mono text-[11px] px-2.5 py-0.5 rounded-[3px] border transition-colors duration-100',
              stage === k
                ? 'border-nexus-accent text-nexus-accent bg-nexus-accent/10'
                : 'border-nexus-line text-nexus-dim hover:border-nexus-accent/50 hover:text-nexus-ink',
            ].join(' ')}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Group sub-filter — only when GROUP stage is active and there are groups */}
      {stage === 'GROUP' && standings.length > 0 && (
        <>
          <div className="w-px h-4 bg-nexus-line" aria-hidden="true" />
          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setGroupId('ALL')}
              className={[
                'font-mono text-[11px] px-2.5 py-0.5 rounded-[3px] border transition-colors duration-100',
                groupId === 'ALL'
                  ? 'border-nexus-accent text-nexus-accent bg-nexus-accent/10'
                  : 'border-nexus-line text-nexus-dim hover:border-nexus-accent/50 hover:text-nexus-ink',
              ].join(' ')}
            >
              全组
            </button>
            {standings.map((s) => (
              <button
                key={s.groupId}
                type="button"
                onClick={() => setGroupId(s.groupId)}
                className={[
                  'font-mono text-[11px] px-2.5 py-0.5 rounded-[3px] border transition-colors duration-100',
                  groupId === s.groupId
                    ? 'border-nexus-accent text-nexus-accent bg-nexus-accent/10'
                    : 'border-nexus-line text-nexus-dim hover:border-nexus-accent/50 hover:text-nexus-ink',
                ].join(' ')}
              >
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Divider */}
      <div className="w-px h-4 bg-nexus-line" aria-hidden="true" />

      {/* Status filter */}
      <div className="flex gap-1.5 flex-wrap">
        {statusOptions.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatus(k)}
            className={[
              'font-mono text-[11px] px-2.5 py-0.5 rounded-[3px] border transition-colors duration-100',
              status === k
                ? 'border-nexus-accent text-nexus-accent bg-nexus-accent/10'
                : 'border-nexus-line text-nexus-dim hover:border-nexus-accent/50 hover:text-nexus-ink',
            ].join(' ')}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function MatchStatusChip({ match }: { match: Match }) {
  if (match.isWalkover || match.status === 'WALKOVER') {
    return <Chip>轮空</Chip>;
  }
  if (match.status === 'CANCELED') {
    return <Chip>已取消</Chip>;
  }
  if (match.status === 'IN_PROGRESS') {
    return (
      <Chip variant="hot">
        <LiveDot />
        LIVE
      </Chip>
    );
  }
  if (match.status === 'FINISHED') {
    return <Chip variant="good">已结束</Chip>;
  }
  return <Chip variant="ac">BO{match.bestOf}</Chip>;
}

function ScoreDisplay({ match }: { match: Match }) {
  if (match.status !== 'FINISHED') {
    return (
      <Readout className="text-[11px] text-nexus-faint">—:—</Readout>
    );
  }
  const aWin =
    match.winnerTeamId !== null && match.winnerTeamId === match.teamA?.id;
  const bWin =
    match.winnerTeamId !== null && match.winnerTeamId === match.teamB?.id;
  return (
    <Readout className="text-[14px] text-nexus-ink font-bold">
      {aWin ? '1' : '0'}&thinsp;:&thinsp;{bWin ? '1' : '0'}
    </Readout>
  );
}

function MatchRow({
  match,
  onMatchClick,
}: {
  match: Match;
  onMatchClick: (id: string) => void;
}) {
  const isCanceled = match.status === 'CANCELED';
  const isLive = match.status === 'IN_PROGRESS';
  const isFinished = match.status === 'FINISHED';
  const aWin =
    isFinished &&
    match.winnerTeamId !== null &&
    match.winnerTeamId === match.teamA?.id;
  const bWin =
    isFinished &&
    match.winnerTeamId !== null &&
    match.winnerTeamId === match.teamB?.id;

  function handleClick() {
    if (!isCanceled) onMatchClick(match.id);
  }

  return (
    <div
      role={isCanceled ? undefined : 'button'}
      tabIndex={isCanceled ? undefined : 0}
      onClick={isCanceled ? undefined : handleClick}
      onKeyDown={
        isCanceled
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
      }
      className={[
        // layout: time | label | teamA | score | teamB | status | arrow
        'grid items-center gap-3 px-4 py-[11px]',
        '[grid-template-columns:56px_auto_1fr_auto_1fr_auto_16px]',
        'border-b border-nexus-line/40 last:border-b-0',
        isCanceled
          ? 'opacity-40 cursor-default'
          : 'cursor-pointer hover:bg-nexus-panel-2/60 transition-colors duration-100',
        isLive && 'bg-nexus-hot/[0.04]',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={
        match.teamA && match.teamB
          ? `${match.teamA.name} vs ${match.teamB.name}`
          : '未排队伍'
      }
    >
      {/* time */}
      <Readout className="text-[11px] text-nexus-faint shrink-0">
        {match.scheduledAt ? fmtTime(match.scheduledAt) : '—'}
      </Readout>

      {/* match label kicker */}
      {match.label ? (
        <Kicker className="opacity-60">{match.label.slice(0, 7)}</Kicker>
      ) : (
        <span />
      )}

      {/* team A */}
      <span
        className={[
          'font-body text-[13.5px] text-right truncate',
          aWin ? 'text-nexus-accent font-bold' : 'text-nexus-ink',
        ].join(' ')}
      >
        {match.teamA?.name ?? (
          <span className="text-nexus-faint">待定</span>
        )}
      </span>

      {/* score */}
      <span className="flex items-center justify-center min-w-[52px]">
        <ScoreDisplay match={match} />
      </span>

      {/* team B */}
      <span
        className={[
          'font-body text-[13.5px] truncate',
          bWin ? 'text-nexus-accent font-bold' : 'text-nexus-ink',
        ].join(' ')}
      >
        {match.teamB?.name ?? (
          <span className="text-nexus-faint">待定</span>
        )}
      </span>

      {/* status chip */}
      <span className="shrink-0">
        <MatchStatusChip match={match} />
      </span>

      {/* arrow */}
      <Readout
        className={[
          'text-[13px] text-right',
          isCanceled ? 'opacity-0' : 'text-nexus-faint',
        ].join(' ')}
        aria-hidden="true"
      >
        ▸
      </Readout>
    </div>
  );
}

export function ScheduleList({ matches, standings = [] }: Props) {
  const { openMatch } = useMatchDrawer();

  // ---- filter state ----
  const [stage, setStage] = useState<StageFilter>('ALL');
  const [groupId, setGroupId] = useState<string | 'ALL'>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');

  if (matches.length === 0) {
    return (
      <p className="text-nexus-faint text-sm text-center py-8 font-mono">
        暂无赛程
      </p>
    );
  }

  // Next upcoming scheduled match for the countdown banner (always from full list)
  const nextMatch = matches
    .filter((m) => m.status === 'SCHEDULED' && m.scheduledAt !== null)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
    )[0];

  // Only show scheduled matches (hide unscheduled null-scheduledAt ones from public view)
  const scheduledMatches = matches.filter((m) => m.scheduledAt !== null);

  // Early return: no scheduled matches at all (before any filter)
  if (scheduledMatches.length === 0) {
    return (
      <p className="text-nexus-faint text-sm text-center py-8 font-mono">
        暂无已排期比赛
      </p>
    );
  }

  // Apply filters
  const filteredMatches = scheduledMatches.filter((m) => {
    // Stage filter
    if (stage === 'GROUP' && m.groupId === null) return false;
    if (stage === 'KO' && m.groupId !== null) return false;
    // Group sub-filter (only meaningful when GROUP stage is active)
    if (stage === 'GROUP' && groupId !== 'ALL' && m.groupId !== groupId)
      return false;
    // Status filter
    if (status !== 'ALL' && m.status !== status) return false;
    return true;
  });

  const allGroups = groupMatchesByDay<Match>(filteredMatches);

  const hasAnyFiltered = filteredMatches.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Next fixture countdown banner */}
      {nextMatch && (
        <Panel glow className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <Kicker as="p" className="mb-1">
              下一场 · NEXT FIXTURE
            </Kicker>
            <span className="font-body text-[14px] text-nexus-ink">
              {nextMatch.teamA?.name ?? '待定'}
              <span className="text-nexus-faint mx-2">vs</span>
              {nextMatch.teamB?.name ?? '待定'}
              {nextMatch.label && (
                <span className="text-nexus-faint ml-2">
                  · {nextMatch.label}
                </span>
              )}
            </span>
          </div>
          <Countdown to={nextMatch.scheduledAt!} label="距开赛" />
        </Panel>
      )}

      {/* Filter bar */}
      <FilterBar
        standings={standings}
        stage={stage}
        setStage={setStage}
        groupId={groupId}
        setGroupId={setGroupId}
        status={status}
        setStatus={setStatus}
      />

      {/* Empty state after filtering */}
      {!hasAnyFiltered && (
        <p className="text-nexus-faint text-sm text-center py-8 font-mono">
          暂无符合条件的比赛
        </p>
      )}

      {/* Day groups */}
      {allGroups.map((group) => (
        <Panel key={group.dayKey}>
          <PanelHead
            title={group.label}
            actions={
              <Readout className="text-[10px] text-nexus-faint">
                {group.count} 场
              </Readout>
            }
          />
          <div>
            {group.matches.map((match) => (
              <MatchRow key={match.id} match={match} onMatchClick={openMatch} />
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
