'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import {
  championIconUrl,
  championKeyByNumericId,
  championName as dataDragonChampionName,
} from '@/lib/tournament/champions';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import NexusButton from '@/components/nexus/NexusButton';
import Chip from '@/components/nexus/Chip';
import Kicker from '@/components/nexus/Kicker';

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchSummary = {
  id: string;
  version: number;
  label: string | null;
  scheduledAt: string | null;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  status: string;
  games?: Array<{
    index: number;
    isDraft: boolean;
    hasBans: boolean;
    hasStats: boolean;
  }>;
};

type MappingRow = {
  capturedParticipantId: number;
  capturedName: string;
  lcuTeamId: number; // 100 = blue, 200 = red
  siteTeamId: string;
  registrationId: string | null;
  candidates: Array<{ registrationId: string; gameId: string; nickname: string }>;
};

type MappingResult = {
  matchId: string;
  blueTeamId: string;
  redTeamId: string;
  rows: MappingRow[];
};

type ImportMeta = {
  gameMode?: string | null;
  gameType?: string | null;
  durationSeconds?: number | null;
  winnerLcuTeamId: 100 | 200 | null;
};

type PlayerStats = {
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  gold: number;
};

type RawPlayer = {
  participantId?: number;
  name: string;
  championId: number;
  championName?: string;
  spell1Id?: number;
  spell2Id?: number;
  teamId: number;
  stats?: Record<string, unknown>;
};

type DetailView = {
  title: string;
  subtitle?: string;
  data: Record<string, unknown>;
};

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  importId: string;
  onClose: () => void;
  onCommitted: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPlayerStats(rawJson: unknown, capturedParticipantId: number): PlayerStats | null {
  try {
    const data = rawJson as {
      players?: Array<{
        participantId?: number;
        stats?: Record<string, unknown>;
      }>;
    };
    if (!Array.isArray(data?.players)) return null;
    const player = data.players.find((p, idx) => {
      // Mirror backend resolvePid: top-level participantId ?? stats.participantId ?? index+1
      const pid =
        p.participantId ??
        (typeof p.stats?.participantId === 'number' ? (p.stats.participantId as number) : idx + 1);
      return pid === capturedParticipantId;
    });
    if (!player?.stats) return null;
    const s = player.stats;
    const n = (k: string) => {
      const v = s[k];
      return typeof v === 'number' ? v : 0;
    };
    return {
      kills: n('kills'),
      deaths: n('deaths'),
      assists: n('assists'),
      cs: n('totalMinionsKilled') + n('neutralMinionsKilled'),
      damage: n('totalDamageDealtToChampions'),
      gold: n('goldEarned'),
    };
  } catch {
    return null;
  }
}

function extractRawPlayers(rawJson: unknown): RawPlayer[] {
  const data = rawJson as { players?: RawPlayer[] };
  return Array.isArray(data?.players) ? data.players : [];
}

function resolveRawPid(p: RawPlayer, index: number): number {
  return (
    p.participantId ??
    (typeof p.stats?.participantId === 'number' ? (p.stats.participantId as number) : index + 1)
  );
}

function findRawPlayer(rawJson: unknown, capturedParticipantId: number): RawPlayer | null {
  return (
    extractRawPlayers(rawJson).find((p, idx) => resolveRawPid(p, idx) === capturedParticipantId) ??
    null
  );
}

function findRawTeam(rawJson: unknown, lcuTeamId: 100 | 200): Record<string, unknown> | null {
  const data = rawJson as { teams?: Array<Record<string, unknown>> };
  const teams = Array.isArray(data?.teams) ? data.teams : [];
  return teams.find((t) => t.teamId === lcuTeamId) ?? null;
}

function lcuSideName(lcuTeamId?: number | null): string {
  if (lcuTeamId === 100) return '蓝方';
  if (lcuTeamId === 200) return '红方';
  return '-';
}

function buildPlayerDetail(player: RawPlayer, pid: number): Record<string, unknown> {
  const { stats, ...topLevel } = player;
  return {
    participantId: pid,
    ...topLevel,
    ...(stats ?? {}),
  };
}

function valueText(v: unknown): string {
  if (v == null) return '-';
  if (typeof v === 'boolean') return v ? '是' : '否';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

function DetailDialog({
  detail,
  onClose,
}: {
  detail: DetailView | null;
  onClose: () => void;
}) {
  if (!detail) return null;
  const entries = Object.entries(detail.data);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[86vh] overflow-y-auto bg-nexus-panel border-nexus-line">
        <DialogHeader>
          <DialogTitle className="font-display text-nexus-ink">{detail.title}</DialogTitle>
          {detail.subtitle ? (
            <DialogDescription className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-faint">
              {detail.subtitle}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 p-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">{key}</div>
              <div className="mt-1 break-words text-[12px] font-medium text-nexus-ink">{valueText(value)}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChampionCell({ player }: { player: RawPlayer | null }) {
  if (!player) return <span className="font-mono text-[10px] text-nexus-faint">-</span>;
  const key = championKeyByNumericId(player.championId);
  const displayName = key
    ? (dataDragonChampionName(key) ?? player.championName ?? key)
    : (player.championName ?? `C${player.championId}`);
  return (
    <div className="flex min-w-32 items-center gap-2">
      {key ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={championIconUrl(key)}
          alt={displayName}
          width={28}
          height={28}
          className="h-7 w-7 rounded-[var(--radius-nexus)] object-cover"
        />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-nexus)] border border-nexus-line font-mono text-[10px] text-nexus-faint">
          ?
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-[12px] text-nexus-ink">{displayName}</div>
        <div className="font-mono text-[10px] text-nexus-faint">#{player.championId}</div>
      </div>
    </div>
  );
}

function extractImportMeta(rawJson: unknown, durationSeconds?: number | null): ImportMeta {
  const data = rawJson as {
    gameMode?: string | null;
    gameType?: string | null;
    gameDuration?: number | null;
    players?: Array<{ teamId?: number; stats?: Record<string, unknown> }>;
  };
  const players = Array.isArray(data?.players) ? data.players : [];
  const t100 = players.filter((p) => p.teamId === 100);
  const t200 = players.filter((p) => p.teamId === 200);
  const allWin = (rows: typeof t100) => rows.length === 5 && rows.every((p) => p.stats?.win === true);
  const allLose = (rows: typeof t100) => rows.length === 5 && rows.every((p) => p.stats?.win === false);
  let winnerLcuTeamId: 100 | 200 | null = null;
  if (allWin(t100) && allLose(t200)) winnerLcuTeamId = 100;
  else if (allLose(t100) && allWin(t200)) winnerLcuTeamId = 200;
  return {
    gameMode: data?.gameMode ?? null,
    gameType: data?.gameType ?? null,
    durationSeconds: durationSeconds ?? data?.gameDuration ?? null,
    winnerLcuTeamId,
  };
}

function formatDuration(secs?: number | null): string {
  if (!secs || secs <= 0) return '-';
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function nextImportIndex(match: MatchSummary): number {
  const draft = match.games?.find((g) => g.isDraft && !g.hasBans && !g.hasStats);
  if (draft) return draft.index;
  return (match.games?.length ?? 0) + 1;
}

function isImportableMatch(m: MatchSummary): boolean {
  if (!m.teamA || !m.teamB || !m.scheduledAt || m.status !== 'SCHEDULED') return false;
  return !(m.games ?? []).some((g) => !g.isDraft || g.hasBans || g.hasStats);
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ImportReviewDialog({ importId, onClose, onCommitted }: Props) {
  // ── import detail ─────────────────────────────────────────────────────────

  const [importDetail, setImportDetail] = useState<{
    id: string;
    source: string;
    externalGameId: string;
    status: string;
    gameMode: string | null;
    gameType: string | null;
    durationSeconds: number | null;
    rawJson: unknown;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  // ── matches list ──────────────────────────────────────────────────────────

  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  // ── selection ─────────────────────────────────────────────────────────────

  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [gameIndex, setGameIndex] = useState<string>('1');

  // ── mapping ───────────────────────────────────────────────────────────────

  const [mapping, setMapping] = useState<MappingResult | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);

  // ── per-player registration selection ────────────────────────────────────

  const [regSelections, setRegSelections] = useState<Record<number, string>>({});

  // ── default stats extracted from rawJson ──────────────────────────────────

  const [defaultStats, setDefaultStats] = useState<Record<number, PlayerStats>>({});

  // ── raw detail viewer ─────────────────────────────────────────────────────

  const [detailView, setDetailView] = useState<DetailView | null>(null);

  // ── saving ────────────────────────────────────────────────────────────────

  const [saving, setSaving] = useState(false);

  // ── fetch import detail ───────────────────────────────────────────────────

  useEffect(() => {
    setDetailLoading(true);
    fetch(`/api/tournament/admin/imports/${importId}`)
      .then((r) => r.json())
      .then((body: {
        import?: {
          id: string;
          source: string;
          externalGameId: string;
          status: string;
          gameMode: string | null;
          gameType: string | null;
          durationSeconds: number | null;
          rawJson: unknown;
        };
      }) => {
        setImportDetail(body.import ?? null);
      })
      .catch(() => toast.error('加载导入详情失败'))
      .finally(() => setDetailLoading(false));
  }, [importId]);

  // ── fetch admin state (matches) ───────────────────────────────────────────

  useEffect(() => {
    setMatchesLoading(true);
    fetch('/api/tournament/admin/state')
      .then((r) => r.json())
      .then((body: { state?: { matches?: MatchSummary[] } }) => {
        const all = body.state?.matches ?? [];
        setMatches(all.filter(isImportableMatch));
      })
      .catch(() => toast.error('加载赛程失败'))
      .finally(() => setMatchesLoading(false));
  }, []);

  // ── extract default stats when importDetail + mapping are ready ───────────

  useEffect(() => {
    if (!importDetail?.rawJson || !mapping) return;
    const stats: Record<number, PlayerStats> = {};
    for (const row of mapping.rows) {
      const s = extractPlayerStats(importDetail.rawJson, row.capturedParticipantId);
      if (s) stats[row.capturedParticipantId] = s;
    }
    setDefaultStats(stats);
  }, [importDetail, mapping]);

  // ── fetch mapping when matchId is selected ───────────────────────────────

  const fetchMapping = useCallback(
    async (matchId: string, blueTeamId?: string) => {
      if (!matchId) return;
      setMappingLoading(true);
      try {
        const url =
          `/api/tournament/admin/imports/${importId}/mapping` +
          `?matchId=${encodeURIComponent(matchId)}` +
          (blueTeamId ? `&blueTeamId=${encodeURIComponent(blueTeamId)}` : '');
        const res = await fetch(url);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(data.error ?? '加载映射失败');
          setMapping(null);
          return;
        }
        const data = (await res.json()) as MappingResult;
        setMapping(data);

        // Pre-fill selections from auto-matched registrationId
        const sels: Record<number, string> = {};
        for (const row of data.rows) {
          sels[row.capturedParticipantId] = row.registrationId ?? '';
        }
        setRegSelections(sels);
      } catch {
        toast.error('加载映射失败');
      } finally {
        setMappingLoading(false);
      }
    },
    [importId],
  );

  useEffect(() => {
    if (selectedMatchId) {
      void fetchMapping(selectedMatchId);
    } else {
      setMapping(null);
    }
  }, [selectedMatchId, fetchMapping]);

  // ── helpers ───────────────────────────────────────────────────────────────

  function handleMatchChange(matchId: string) {
    setSelectedMatchId(matchId);
    const match = matches.find((m) => m.id === matchId);
    setGameIndex(match ? String(nextImportIndex(match)) : '1');
    setMapping(null);
  }

  function handleSwapSides() {
    if (!selectedMatchId || !mapping) return;
    void fetchMapping(selectedMatchId, mapping.redTeamId);
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const selectedMatch = matches.find((m) => m.id === selectedMatchId) ?? null;
  const importMeta = importDetail
    ? extractImportMeta(importDetail.rawJson, importDetail.durationSeconds)
    : null;
  const teamNameById = (id: string) => {
    if (selectedMatch?.teamA?.id === id) return selectedMatch.teamA.name;
    if (selectedMatch?.teamB?.id === id) return selectedMatch.teamB.name;
    return id;
  };
  const winnerTeamName =
    mapping && importMeta?.winnerLcuTeamId
      ? teamNameById(importMeta.winnerLcuTeamId === 100 ? mapping.blueTeamId : mapping.redTeamId)
      : null;
  const rawPreviewRows = importDetail?.rawJson
    ? extractRawPlayers(importDetail.rawJson).map((player, index) => {
      const pid = resolveRawPid(player, index);
      return {
        pid,
        player,
        stats: extractPlayerStats(importDetail.rawJson, pid),
      };
    })
    : [];
  const rawWinnerSide = importMeta?.winnerLcuTeamId
    ? lcuSideName(importMeta.winnerLcuTeamId)
    : '-';
  const playerByPid = (pid: number) =>
    importDetail?.rawJson ? findRawPlayer(importDetail.rawJson, pid) : null;
  const showRawTeamDetail = (lcuTeamId: 100 | 200) => {
    if (!importDetail?.rawJson) return;
    const data = findRawTeam(importDetail.rawJson, lcuTeamId);
    if (!data) return;
    setDetailView({
      title: `${lcuSideName(lcuTeamId)}队伍详情`,
      subtitle: 'LCU 原始队伍数据',
      data,
    });
  };
  const showRawPlayerDetail = (player: RawPlayer, pid: number) => {
    setDetailView({
      title: `${player.name} 选手详情`,
      subtitle: `${lcuSideName(player.teamId)} · LCU 原始选手数据`,
      data: buildPlayerDetail(player, pid),
    });
  };
  const showTeamDetail = (lcuTeamId: 100 | 200) => {
    if (!importDetail?.rawJson || !mapping) return;
    const data = findRawTeam(importDetail.rawJson, lcuTeamId);
    if (!data) return;
    setDetailView({
      title: `${lcuTeamId === 100 ? '蓝方' : '红方'}队伍详情`,
      subtitle: teamNameById(lcuTeamId === 100 ? mapping.blueTeamId : mapping.redTeamId),
      data,
    });
  };
  const showPlayerDetail = (row: MappingRow) => {
    const player = playerByPid(row.capturedParticipantId);
    if (!player) return;
    setDetailView({
      title: `${row.capturedName} 选手详情`,
      subtitle: `${teamNameById(row.siteTeamId)} · ${row.lcuTeamId === 100 ? '蓝方' : '红方'}`,
      data: buildPlayerDetail(player, row.capturedParticipantId),
    });
  };

  // ── submit ────────────────────────────────────────────────────────────────

  async function handleCommit() {
    if (!mapping || !selectedMatch) {
      toast.error('请先选择比赛并加载映射');
      return;
    }

    const idx = parseInt(gameIndex, 10);
    if (isNaN(idx) || idx < 1) {
      toast.error('局序号须为正整数');
      return;
    }

    const unmapped = mapping.rows.filter((row) => !regSelections[row.capturedParticipantId]);
    if (unmapped.length > 0) {
      toast.error(`${unmapped.length} 名玩家尚未映射，请补全后提交`);
      return;
    }

    const mappings = mapping.rows.map((row) => ({
      capturedParticipantId: row.capturedParticipantId,
      registrationId: regSelections[row.capturedParticipantId],
    }));

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        matchId: selectedMatch.id,
        expectedVersion: selectedMatch.version,
        gameIndex: idx,
        blueTeamId: mapping.blueTeamId,
        mappings,
      };

      const res = await fetch(`/api/tournament/admin/imports/${importId}/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; gameId: string };
        toast.success(`提交成功，局 ID：${data.gameId}`);
        onCommitted();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? '提交失败');
      }
    } catch {
      toast.error('提交失败');
    } finally {
      setSaving(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  const loading = detailLoading || matchesLoading;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-nexus-panel border-nexus-line">
        <DialogHeader>
          <DialogTitle className="font-display text-nexus-ink">
            审核导入 — {importDetail?.externalGameId ?? importId}
          </DialogTitle>
          <DialogDescription className="sr-only">对局导入映射审核</DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="font-mono text-[11px] text-nexus-faint">加载中…</p>
        )}

        {!loading && (
          <div className="space-y-5">
            {/* ── 基本信息 ── */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[11px] text-nexus-dim">
                来源：<Chip>{importDetail?.source}</Chip>
              </span>
              <span className="font-mono text-[11px] text-nexus-dim">
                状态：<Chip variant="ac">{importDetail?.status}</Chip>
              </span>
              {importDetail?.externalGameId && (
                <span className="font-mono text-[10px] text-nexus-faint">
                  gameId: {importDetail.externalGameId}
                </span>
              )}
            </div>

            {/* ── LCU 数据预览 ── */}
            {importDetail && (
              <Panel>
                <PanelHead
                  title="LCU 数据预览"
                  actions={
                    <div className="flex gap-2">
                      <NexusButton
                        size="sm"
                        onClick={() => showRawTeamDetail(100)}
                      >
                        蓝方详情
                      </NexusButton>
                      <NexusButton
                        size="sm"
                        onClick={() => showRawTeamDetail(200)}
                      >
                        红方详情
                      </NexusButton>
                    </div>
                  }
                />
                <div className="p-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <Kicker className="mb-1">模式</Kicker>
                      <div className="text-[12px] text-nexus-ink">
                        {importMeta?.gameMode ?? '-'} / {importMeta?.gameType ?? '-'}
                      </div>
                    </div>
                    <div>
                      <Kicker className="mb-1">时长</Kicker>
                      <div className="font-mono text-[12px] tabular-nums text-nexus-ink">
                        {formatDuration(importMeta?.durationSeconds)}
                      </div>
                    </div>
                    <div>
                      <Kicker className="mb-1">胜者</Kicker>
                      <div className="text-[12px] text-nexus-ink">{rawWinnerSide}</div>
                    </div>
                    <div>
                      <Kicker className="mb-1">玩家</Kicker>
                      <div className="font-mono text-[12px] tabular-nums text-nexus-ink">
                        {rawPreviewRows.length || '-'}
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-nexus-line hover:bg-transparent">
                          <TableHead className="font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">LCU 名称</TableHead>
                          <TableHead className="font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">英雄</TableHead>
                          <TableHead className="font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">阵营</TableHead>
                          <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">KDA</TableHead>
                          <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">CS</TableHead>
                          <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">伤害</TableHead>
                          <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">金币</TableHead>
                          <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">详情</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rawPreviewRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="py-6 text-center font-mono text-[11px] text-nexus-faint">
                              暂无 LCU 玩家数据
                            </TableCell>
                          </TableRow>
                        )}
                        {rawPreviewRows.map(({ pid, player, stats }) => {
                          const isBlue = player.teamId === 100;
                          return (
                            <TableRow key={pid} className="border-nexus-line/40">
                              <TableCell className="font-mono text-[11px] text-nexus-ink">
                                {player.name}
                              </TableCell>
                              <TableCell>
                                <ChampionCell player={player} />
                              </TableCell>
                              <TableCell>
                                <Chip variant={isBlue ? 'ac' : 'default'}>
                                  {lcuSideName(player.teamId)}
                                </Chip>
                              </TableCell>
                              <TableCell className="text-center tabular-nums text-[12px] text-nexus-ink">
                                {stats ? `${stats.kills}/${stats.deaths}/${stats.assists}` : '-'}
                              </TableCell>
                              <TableCell className="text-center tabular-nums text-[12px] text-nexus-ink">
                                {stats?.cs ?? '-'}
                              </TableCell>
                              <TableCell className="text-center tabular-nums text-[12px] text-nexus-ink">
                                {stats?.damage ?? '-'}
                              </TableCell>
                              <TableCell className="text-center tabular-nums text-[12px] text-nexus-ink">
                                {stats?.gold ?? '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                <NexusButton
                                  size="sm"
                                  onClick={() => showRawPlayerDetail(player, pid)}
                                >
                                  详情
                                </NexusButton>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </Panel>
            )}

            {/* ── 选择比赛 ── */}
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.18em] text-nexus-faint">选择比赛</Label>
              <Select value={selectedMatchId} onValueChange={handleMatchChange}>
                <SelectTrigger className="max-w-sm border-nexus-line bg-nexus-panel-2 text-nexus-ink">
                  <SelectValue placeholder="选择比赛…" />
                </SelectTrigger>
                <SelectContent>
                  {matches.length === 0 && (
                    <SelectItem value="__empty__" disabled>
                      暂无可用比赛
                    </SelectItem>
                  )}
                  {matches.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.teamA!.name} vs {m.teamB!.name}
                      {m.label ? ` · ${m.label}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── 局序号 ── */}
            {selectedMatch && (
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.18em] text-nexus-faint">
                  局序号（gameIndex）
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={gameIndex}
                  onChange={(e) => setGameIndex(e.target.value)}
                  className="w-24 border-nexus-line bg-nexus-panel-2 text-nexus-ink"
                />
              </div>
            )}

            {/* ── 映射加载 ── */}
            {mappingLoading && (
              <p className="font-mono text-[11px] text-nexus-faint">加载映射中…</p>
            )}

            {mapping && !mappingLoading && (
              <Panel>
                <PanelHead
                  title="映射信息"
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <NexusButton
                        size="sm"
                        disabled={mappingLoading}
                        onClick={handleSwapSides}
                      >
                        交换红蓝方
                      </NexusButton>
                      <NexusButton
                        size="sm"
                        onClick={() => showTeamDetail(100)}
                      >
                        蓝方详情
                      </NexusButton>
                      <NexusButton
                        size="sm"
                        onClick={() => showTeamDetail(200)}
                      >
                        红方详情
                      </NexusButton>
                    </div>
                  }
                />
                <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Kicker className="mb-1">模式</Kicker>
                    <div className="text-[12px] text-nexus-ink">
                      {importMeta?.gameMode ?? '-'} / {importMeta?.gameType ?? '-'}
                    </div>
                  </div>
                  <div>
                    <Kicker className="mb-1">时长</Kicker>
                    <div className="font-mono text-[12px] tabular-nums text-nexus-ink">
                      {formatDuration(importMeta?.durationSeconds)}
                    </div>
                  </div>
                  <div>
                    <Kicker className="mb-1">胜者</Kicker>
                    <div className="text-[12px] text-nexus-ink">{winnerTeamName ?? '-'}</div>
                  </div>
                  <div>
                    <Kicker className="mb-1">红蓝方</Kicker>
                    <div className="text-[12px] text-nexus-ink">
                      蓝 {teamNameById(mapping.blueTeamId)} / 红 {teamNameById(mapping.redTeamId)}
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {/* ── 映射表格 ── */}
            {mapping && !mappingLoading && (
              <Panel>
                <PanelHead title="玩家映射" />
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-nexus-line hover:bg-transparent">
                        <TableHead className="font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">LCU 名称</TableHead>
                        <TableHead className="font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">英雄</TableHead>
                        <TableHead className="font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">阵营</TableHead>
                        <TableHead className="font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">站内队伍</TableHead>
                        <TableHead className="font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">映射选手</TableHead>
                        <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">KDA</TableHead>
                        <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">CS</TableHead>
                        <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">伤害</TableHead>
                        <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">金币</TableHead>
                        <TableHead className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-faint">详情</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mapping.rows.map((row) => {
                        const pid = row.capturedParticipantId;
                        const isBlue = row.lcuTeamId === 100;
                        const currentSel = regSelections[pid] ?? '';
                        const isMissing = !currentSel;
                        const stats = defaultStats[pid];
                        const rawPlayer = playerByPid(pid);
                        return (
                          <TableRow
                            key={pid}
                            className={isMissing ? 'bg-nexus-bad/5 border-nexus-line/40' : 'border-nexus-line/40'}
                          >
                            <TableCell className="font-mono text-[11px]">
                              {row.capturedName}
                            </TableCell>
                            <TableCell>
                              <ChampionCell player={rawPlayer} />
                            </TableCell>
                            <TableCell>
                              <Chip variant={isBlue ? 'ac' : 'default'}>
                                {isBlue ? '蓝' : '红'}
                              </Chip>
                            </TableCell>
                            <TableCell className="text-[12px] text-nexus-ink">
                              {teamNameById(row.siteTeamId)}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={currentSel || '__none__'}
                                onValueChange={(v) => {
                                  setRegSelections((prev) => ({
                                    ...prev,
                                    [pid]: v === '__none__' ? '' : v,
                                  }));
                                }}
                              >
                                <SelectTrigger className="w-44 h-8 border-nexus-line bg-nexus-panel-2 text-[12px] text-nexus-ink">
                                  <SelectValue placeholder="未映射" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">
                                    — 未映射 —
                                  </SelectItem>
                                  {row.candidates.map((c) => (
                                    <SelectItem
                                      key={c.registrationId}
                                      value={c.registrationId}
                                    >
                                      {c.nickname}（{c.gameId}）
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center tabular-nums text-[12px] text-nexus-ink">
                              {stats ? `${stats.kills}/${stats.deaths}/${stats.assists}` : '-'}
                            </TableCell>
                            <TableCell className="text-center tabular-nums text-[12px] text-nexus-ink">
                              {stats?.cs ?? '-'}
                            </TableCell>
                            <TableCell className="text-center tabular-nums text-[12px] text-nexus-ink">
                              {stats?.damage ?? '-'}
                            </TableCell>
                            <TableCell className="text-center tabular-nums text-[12px] text-nexus-ink">
                              {stats?.gold ?? '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              <NexusButton
                                size="sm"
                                onClick={() => showPlayerDetail(row)}
                              >
                                详情
                              </NexusButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Panel>
            )}

            {/* ── 提交 ── */}
            <div className="flex justify-end gap-2 pt-2">
              <NexusButton onClick={onClose} disabled={saving}>
                取消
              </NexusButton>
              <NexusButton
                variant="primary"
                onClick={() => void handleCommit()}
                disabled={saving || !mapping}
              >
                <LoadingButtonContent loading={saving} loadingText="提交中…">
                  提交导入
                </LoadingButtonContent>
              </NexusButton>
            </div>
          </div>
        )}
        <DetailDialog detail={detailView} onClose={() => setDetailView(null)} />
      </DialogContent>
    </Dialog>
  );
}
