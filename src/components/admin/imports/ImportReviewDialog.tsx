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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchSummary = {
  id: string;
  version: number;
  label: string | null;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  status: string;
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

type StatOverride = {
  kills?: number;
  deaths?: number;
  assists?: number;
  cs?: number;
  damage?: number;
  gold?: number;
};

type PlayerStats = {
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  gold: number;
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
    const player = data.players.find(
      (p) => (p.participantId ?? 0) === capturedParticipantId,
    );
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
      cs: n('totalMinionsKilled'),
      damage: n('totalDamageDealtToChampions'),
      gold: n('goldEarned'),
    };
  } catch {
    return null;
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ImportReviewDialog({ importId, onClose, onCommitted }: Props) {
  // ── import detail ─────────────────────────────────────────────────────────

  const [importDetail, setImportDetail] = useState<{
    id: string;
    source: string;
    externalGameId: string;
    status: string;
    rawJson: unknown;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  // ── matches list ──────────────────────────────────────────────────────────

  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  // ── selection ─────────────────────────────────────────────────────────────

  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [selectedBlueTeamId, setSelectedBlueTeamId] = useState<string>('');
  const [gameIndex, setGameIndex] = useState<string>('1');

  // ── mapping ───────────────────────────────────────────────────────────────

  const [mapping, setMapping] = useState<MappingResult | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);

  // ── per-player registration selection ────────────────────────────────────

  const [regSelections, setRegSelections] = useState<Record<number, string>>({});

  // ── per-player stat overrides ─────────────────────────────────────────────

  const [statOverrides, setStatOverrides] = useState<Record<number, StatOverride>>({});

  // ── default stats extracted from rawJson ──────────────────────────────────

  const [defaultStats, setDefaultStats] = useState<Record<number, PlayerStats>>({});

  // ── saving ────────────────────────────────────────────────────────────────

  const [saving, setSaving] = useState(false);

  // ── fetch import detail ───────────────────────────────────────────────────

  useEffect(() => {
    setDetailLoading(true);
    fetch(`/api/tournament/admin/imports/${importId}`)
      .then((r) => r.json())
      .then((body: { import?: { id: string; source: string; externalGameId: string; status: string; rawJson: unknown } }) => {
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
        setMatches(all.filter((m) => m.teamA && m.teamB && m.status === 'SCHEDULED'));
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

  // ── fetch mapping when matchId + blueTeamId are selected ─────────────────

  const fetchMapping = useCallback(
    async (matchId: string, blueTeamId: string) => {
      if (!matchId || !blueTeamId) return;
      setMappingLoading(true);
      try {
        const url =
          `/api/tournament/admin/imports/${importId}/mapping` +
          `?matchId=${encodeURIComponent(matchId)}&blueTeamId=${encodeURIComponent(blueTeamId)}`;
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
        setStatOverrides({});
      } catch {
        toast.error('加载映射失败');
      } finally {
        setMappingLoading(false);
      }
    },
    [importId],
  );

  useEffect(() => {
    if (selectedMatchId && selectedBlueTeamId) {
      void fetchMapping(selectedMatchId, selectedBlueTeamId);
    } else {
      setMapping(null);
    }
  }, [selectedMatchId, selectedBlueTeamId, fetchMapping]);

  // ── helpers ───────────────────────────────────────────────────────────────

  function handleMatchChange(matchId: string) {
    setSelectedMatchId(matchId);
    setSelectedBlueTeamId('');
    setMapping(null);
  }

  function getStatValue(pid: number, key: keyof PlayerStats): string {
    const ov = statOverrides[pid];
    if (ov && key in ov) return String(ov[key as keyof StatOverride] ?? '');
    const def = defaultStats[pid];
    return def ? String(def[key]) : '';
  }

  function setStatValue(pid: number, key: keyof StatOverride, raw: string) {
    const val = raw === '' ? undefined : Number(raw);
    const defVal = defaultStats[pid]?.[key as keyof PlayerStats];
    setStatOverrides((prev) => {
      const curr = { ...(prev[pid] ?? {}) };
      if (val === undefined || val === defVal) {
        delete curr[key];
      } else {
        curr[key] = val;
      }
      if (Object.keys(curr).length === 0) {
        const next = { ...prev };
        delete next[pid];
        return next;
      }
      return { ...prev, [pid]: curr };
    });
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const selectedMatch = matches.find((m) => m.id === selectedMatchId) ?? null;

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

    const overridesEntries = Object.entries(statOverrides).filter(
      ([, ov]) => Object.keys(ov).length > 0,
    );
    const overrides =
      overridesEntries.length > 0
        ? Object.fromEntries(overridesEntries.map(([k, v]) => [Number(k), v]))
        : undefined;

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        matchId: selectedMatch.id,
        expectedVersion: selectedMatch.version,
        gameIndex: idx,
        blueTeamId: selectedBlueTeamId,
        mappings,
      };
      if (overrides) body.overrides = overrides;

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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            审核导入 — {importDetail?.externalGameId ?? importId}
          </DialogTitle>
          <DialogDescription className="sr-only">对局导入映射审核</DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="text-sm text-muted-foreground">加载中…</p>
        )}

        {!loading && (
          <div className="space-y-5">
            {/* ── 基本信息 ── */}
            <div className="flex flex-wrap gap-3 text-sm">
              <span>
                来源：<Badge variant="outline">{importDetail?.source}</Badge>
              </span>
              <span>
                状态：<Badge variant="secondary">{importDetail?.status}</Badge>
              </span>
              {importDetail?.externalGameId && (
                <span className="font-mono text-xs text-muted-foreground">
                  gameId: {importDetail.externalGameId}
                </span>
              )}
            </div>

            {/* ── 选择比赛 ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">选择比赛</Label>
              <Select value={selectedMatchId} onValueChange={handleMatchChange}>
                <SelectTrigger className="max-w-sm">
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

            {/* ── 选择蓝方 ── */}
            {selectedMatch && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">蓝方</Label>
                <Select
                  value={selectedBlueTeamId}
                  onValueChange={setSelectedBlueTeamId}
                >
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="选择蓝方队伍…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={selectedMatch.teamA!.id}>
                      {selectedMatch.teamA!.name}（蓝方）
                    </SelectItem>
                    <SelectItem value={selectedMatch.teamB!.id}>
                      {selectedMatch.teamB!.name}（蓝方）
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── 局序号 ── */}
            {selectedMatch && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">局序号（gameIndex）</Label>
                <Input
                  type="number"
                  min={1}
                  value={gameIndex}
                  onChange={(e) => setGameIndex(e.target.value)}
                  className="w-24"
                />
              </div>
            )}

            {/* ── 映射加载 ── */}
            {mappingLoading && (
              <p className="text-sm text-muted-foreground">加载映射中…</p>
            )}

            {/* ── 映射表格 ── */}
            {mapping && !mappingLoading && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">玩家映射</Label>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>LCU 名称</TableHead>
                        <TableHead>阵营</TableHead>
                        <TableHead>映射选手</TableHead>
                        <TableHead className="text-center">击杀</TableHead>
                        <TableHead className="text-center">死亡</TableHead>
                        <TableHead className="text-center">助攻</TableHead>
                        <TableHead className="text-center">CS</TableHead>
                        <TableHead className="text-center">伤害</TableHead>
                        <TableHead className="text-center">金币</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mapping.rows.map((row) => {
                        const pid = row.capturedParticipantId;
                        const isBlue = row.lcuTeamId === 100;
                        const currentSel = regSelections[pid] ?? '';
                        const isMissing = !currentSel;
                        return (
                          <TableRow
                            key={pid}
                            className={isMissing ? 'bg-destructive/5' : undefined}
                          >
                            <TableCell className="font-mono text-xs">
                              {row.capturedName}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isBlue ? 'default' : 'secondary'}>
                                {isBlue ? '蓝' : '红'}
                              </Badge>
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
                                <SelectTrigger className="w-44 h-8 text-sm">
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
                            {(
                              [
                                'kills',
                                'deaths',
                                'assists',
                                'cs',
                                'damage',
                                'gold',
                              ] as const
                            ).map((key) => (
                              <TableCell key={key}>
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-8 w-20 text-center text-sm"
                                  value={getStatValue(pid, key)}
                                  onChange={(e) =>
                                    setStatValue(pid, key, e.target.value)
                                  }
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* ── 提交 ── */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                取消
              </Button>
              <Button
                onClick={() => void handleCommit()}
                disabled={saving || !mapping}
              >
                <LoadingButtonContent loading={saving} loadingText="提交中…">
                  提交导入
                </LoadingButtonContent>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
