'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { ChampionSelect } from './ChampionSelect';

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamRef = { id: string; name: string };

type RosterPlayer = { registrationId: string; nickname: string };
type Roster = { teamId: string; players: RosterPlayer[] };

/** Shape returned by GET /api/tournament/admin/matches/[id] for each game */
export type GameDetailInitial = {
  id: string;
  index: number;
  isDraft: boolean;
  winnerTeamId: string | null;
  hasBans: boolean;
  hasStats: boolean;
  /** Pre-fetched detail; may be undefined when the parent hasn't loaded it yet. */
  blueTeamId?: string | null;
  durationSeconds?: number | null;
  mvpRegistrationId?: string | null;
  bans?: Array<{ teamId: string; type: 'BAN' | 'PICK'; championId: string; order: number }> | null;
  playerStats?: Array<{
    teamId: string;
    registrationId: string;
    championId: string;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    damage: number;
    gold: number;
  }> | null;
};

export type Props = {
  open: boolean;
  onClose: () => void;
  match: {
    id: string;
    version: number;
    teamA: TeamRef;
    teamB: TeamRef;
    bestOf: number;
  };
  /** undefined = new game; present = edit existing */
  gameId?: string;
  initial?: GameDetailInitial | null;
  /** Both teams' roster snapshots (5 players each) */
  rosters: Roster[];
  refetch: () => Promise<void>;
};

// ── Sub-types for local state ─────────────────────────────────────────────────

type BanRow = { teamId: string; type: 'BAN' | 'PICK'; championId: string | null };

type StatRow = {
  registrationId: string;
  nickname: string;
  championId: string | null;
  kills: string;
  deaths: string;
  assists: string;
  cs: string;
  damage: string;
  gold: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function blankStatRow(p: RosterPlayer): StatRow {
  return {
    registrationId: p.registrationId,
    nickname: p.nickname,
    championId: null,
    kills: '',
    deaths: '',
    assists: '',
    cs: '',
    damage: '',
    gold: '',
  };
}

function parseNonNeg(s: string): number | null {
  if (s === '') return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function secondsToMinSec(s: number | null | undefined): { min: string; sec: string } {
  if (s == null) return { min: '', sec: '' };
  return { min: String(Math.floor(s / 60)), sec: String(s % 60) };
}

function minSecToSeconds(min: string, sec: string): number | null {
  const m = parseNonNeg(min);
  const s = parseNonNeg(sec);
  if (m === null || s === null) return null;
  if (s >= 60) return null;
  return m * 60 + s;
}

type RawStat = NonNullable<NonNullable<GameDetailInitial['playerStats']>[number]>;

function populateStatRow(p: RosterPlayer, existing: RawStat | undefined): StatRow {
  if (!existing) return blankStatRow(p);
  return {
    registrationId: p.registrationId,
    nickname: p.nickname,
    championId: existing.championId,
    kills: String(existing.kills),
    deaths: String(existing.deaths),
    assists: String(existing.assists),
    cs: String(existing.cs),
    damage: String(existing.damage),
    gold: String(existing.gold),
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export function GameDetailEditor({
  open,
  onClose,
  match,
  gameId,
  initial,
  rosters,
  refetch,
}: Props) {
  const isEdit = !!gameId;
  const isPromoted = isEdit && initial != null && !initial.isDraft;

  const rosterA = rosters.find((r) => r.teamId === match.teamA.id);
  const rosterB = rosters.find((r) => r.teamId === match.teamB.id);
  const playersA: RosterPlayer[] = rosterA?.players ?? [];
  const playersB: RosterPlayer[] = rosterB?.players ?? [];

  // ── Local state ──────────────────────────────────────────────────────────────

  const [blueTeamId, setBlueTeamId] = useState<string | null>(null);
  const [blueTouched, setBlueTouched] = useState(false);

  const [durationMin, setDurationMin] = useState('');
  const [durationSec, setDurationSec] = useState('');
  const [durationTouched, setDurationTouched] = useState(false);

  const [winnerTeamId, setWinnerTeamId] = useState<string | null>(null);
  const [winnerTouched, setWinnerTouched] = useState(false);

  const [bans, setBans] = useState<BanRow[]>([]);
  const [bansTouched, setBansTouched] = useState(false);
  const [bansCleared, setBansCleared] = useState(false);

  const [statsA, setStatsA] = useState<StatRow[]>([]);
  const [statsB, setStatsB] = useState<StatRow[]>([]);
  const [statsTouched, setStatsTouched] = useState(false);
  const [statsCleared, setStatsCleared] = useState(false);

  const [mvp, setMvp] = useState<string | null>(null);
  const [mvpTouched, setMvpTouched] = useState(false);

  const [saving, setSaving] = useState(false);

  // ── Initialise / reset when dialog opens ────────────────────────────────────

  const resetForm = useCallback(() => {
    setBlueTeamId(initial?.blueTeamId ?? null);
    setBlueTouched(false);

    const { min, sec } = secondsToMinSec(initial?.durationSeconds);
    setDurationMin(min);
    setDurationSec(sec);
    setDurationTouched(false);

    setWinnerTeamId(initial?.winnerTeamId ?? null);
    setWinnerTouched(false);

    const initBans = initial?.bans;
    setBans(
      initBans && initBans.length > 0
        ? initBans.map((b) => ({ teamId: b.teamId, type: b.type, championId: b.championId }))
        : [],
    );
    setBansTouched(false);
    setBansCleared(false);

    const initStats = initial?.playerStats;
    setStatsA(
      playersA.map((p) =>
        populateStatRow(p, initStats?.find((s) => s.registrationId === p.registrationId)),
      ),
    );
    setStatsB(
      playersB.map((p) =>
        populateStatRow(p, initStats?.find((s) => s.registrationId === p.registrationId)),
      ),
    );
    setStatsTouched(false);
    setStatsCleared(false);

    setMvp(initial?.mvpRegistrationId ?? null);
    setMvpTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, gameId]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  // ── Derived: stats completeness ───────────────────────────────────────────

  function isStatRowComplete(row: StatRow): boolean {
    if (!row.championId) return false;
    return [row.kills, row.deaths, row.assists, row.cs, row.damage, row.gold].every(
      (f) => parseNonNeg(f) !== null,
    );
  }

  const statsAComplete = statsA.length === 5 && statsA.every(isStatRowComplete);
  const statsBComplete = statsB.length === 5 && statsB.every(isStatRowComplete);
  const statsAllComplete = statsAComplete && statsBComplete;
  const mvpEnabled = statsAllComplete && !statsCleared;

  // ── All players for MVP select ────────────────────────────────────────────

  const allPlayers = [
    ...playersA.map((p) => ({ ...p, teamName: match.teamA.name })),
    ...playersB.map((p) => ({ ...p, teamName: match.teamB.name })),
  ];

  // ── Ban row helpers ───────────────────────────────────────────────────────

  function addBanRow() {
    setBans((prev) => [...prev, { teamId: match.teamA.id, type: 'BAN', championId: null }]);
    setBansTouched(true);
    setBansCleared(false);
  }

  function removeBanRow(idx: number) {
    setBans((prev) => prev.filter((_, i) => i !== idx));
    setBansTouched(true);
  }

  function updateBanRow(idx: number, patch: Partial<BanRow>) {
    setBans((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
    setBansTouched(true);
    setBansCleared(false);
  }

  function clearBans() {
    setBans([]);
    setBansTouched(true);
    setBansCleared(true);
  }

  // ── Stats helpers ────────────────────────────────────────────────────────

  function updateStatRow(team: 'A' | 'B', idx: number, patch: Partial<StatRow>) {
    if (team === 'A') {
      setStatsA((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    } else {
      setStatsB((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    }
    setStatsTouched(true);
    setStatsCleared(false);
  }

  function clearStats() {
    setStatsA(playersA.map(blankStatRow));
    setStatsB(playersB.map(blankStatRow));
    setStatsTouched(true);
    setStatsCleared(true);
    setMvp(null);
    setMvpTouched(true);
  }

  // ── Build tri-state payload ───────────────────────────────────────────────

  function buildPayload(): Record<string, unknown> {
    const detail: Record<string, unknown> = {};

    // winnerTeamId: for new game always include; for edits only if touched
    if (!isEdit || winnerTouched) {
      detail.winnerTeamId = winnerTeamId;
    }
    if (blueTouched) {
      detail.blueTeamId = blueTeamId;
    }
    if (durationTouched) {
      const secs = minSecToSeconds(durationMin, durationSec);
      detail.durationSeconds = secs;
    }
    if (bansTouched) {
      if (bansCleared) {
        detail.bans = null;
      } else {
        detail.bans = bans.map((b, i) => ({
          teamId: b.teamId,
          type: b.type,
          championId: b.championId ?? '',
          order: i + 1,
        }));
      }
    }
    if (statsTouched) {
      if (statsCleared) {
        detail.playerStats = null;
      } else {
        const rowsA = statsA.map((r) => ({
          teamId: match.teamA.id,
          registrationId: r.registrationId,
          championId: r.championId ?? '',
          kills: parseNonNeg(r.kills) ?? 0,
          deaths: parseNonNeg(r.deaths) ?? 0,
          assists: parseNonNeg(r.assists) ?? 0,
          cs: parseNonNeg(r.cs) ?? 0,
          damage: parseNonNeg(r.damage) ?? 0,
          gold: parseNonNeg(r.gold) ?? 0,
        }));
        const rowsB = statsB.map((r) => ({
          teamId: match.teamB.id,
          registrationId: r.registrationId,
          championId: r.championId ?? '',
          kills: parseNonNeg(r.kills) ?? 0,
          deaths: parseNonNeg(r.deaths) ?? 0,
          assists: parseNonNeg(r.assists) ?? 0,
          cs: parseNonNeg(r.cs) ?? 0,
          damage: parseNonNeg(r.damage) ?? 0,
          gold: parseNonNeg(r.gold) ?? 0,
        }));
        detail.playerStats = [...rowsA, ...rowsB];
      }
    }
    if (mvpTouched) {
      detail.mvpRegistrationId = mvp;
    }

    return detail;
  }

  // ── Client-side validation before save ──────────────────────────────────

  function validate(): string | null {
    if (bansTouched && !bansCleared) {
      for (let i = 0; i < bans.length; i++) {
        if (!bans[i].championId) return `BP 第 ${i + 1} 行缺少英雄`;
      }
      const seen = new Set<string>();
      for (const b of bans) {
        if (seen.has(b.championId!)) return `BP 中英雄重复：${b.championId}`;
        seen.add(b.championId!);
      }
    }

    if (statsTouched && !statsCleared && !statsAllComplete) {
      return '双方选手数据须完整填写（各 5 人，所有字段非负整数）';
    }

    if (durationTouched && (durationMin !== '' || durationSec !== '')) {
      const s = minSecToSeconds(durationMin, durationSec);
      if (s === null) return '时长格式错误（秒须为 0–59 的非负整数）';
      if (s < 1 || s > 7200) return '时长须在 1 秒至 120 分钟之间';
    }

    if (isPromoted && winnerTeamId === null) {
      return '已转正局必须选择胜方';
    }

    return null;
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSaving(true);
    try {
      const detail = buildPayload();
      const body: Record<string, unknown> = { expectedVersion: match.version, detail };
      if (gameId) body.gameId = gameId;

      const res = await fetch(`/api/tournament/admin/matches/${match.id}/games`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(isEdit ? '已保存' : '新建局成功');
        await refetch();
        onClose();
      } else if (res.status === 409) {
        toast.error('该比赛已被修改，已刷新');
        await refetch();
        // keep dialog open — parent passes updated match.version via props
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error ?? '保存失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const title = isEdit ? `编辑第 ${initial?.index ?? '?'} 局` : '新建局';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {match.teamA.name} vs {match.teamB.name} · {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? '编辑局数据' : '新建局并录入数据'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── 蓝方 ── */}
          <Section title="蓝方">
            <div className="max-w-xs">
              <Select
                value={blueTeamId ?? '__none__'}
                onValueChange={(v) => {
                  setBlueTeamId(v === '__none__' ? null : v);
                  setBlueTouched(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择蓝方" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— 不设置 —</SelectItem>
                  <SelectItem value={match.teamA.id}>{match.teamA.name}</SelectItem>
                  <SelectItem value={match.teamB.id}>{match.teamB.name}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Section>

          <Separator />

          {/* ── 时长 ── */}
          <Section title="时长（分:秒）">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder="分"
                value={durationMin}
                onChange={(e) => {
                  setDurationMin(e.target.value);
                  setDurationTouched(true);
                }}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                placeholder="秒"
                value={durationSec}
                onChange={(e) => {
                  setDurationSec(e.target.value);
                  setDurationTouched(true);
                }}
                className="w-20"
              />
              {durationTouched && (durationMin !== '' || durationSec !== '') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDurationMin('');
                    setDurationSec('');
                    setDurationTouched(true);
                  }}
                >
                  清空
                </Button>
              )}
            </div>
          </Section>

          <Separator />

          {/* ── BP 编辑器 ── */}
          <Section
            title="BP（禁/选英雄）"
            action={
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={clearBans}
              >
                整段清空
              </Button>
            }
          >
            <div className="space-y-2">
              {bans.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
                    {idx + 1}
                  </span>
                  <Select
                    value={row.teamId}
                    onValueChange={(v) => updateBanRow(idx, { teamId: v })}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={match.teamA.id}>{match.teamA.name}</SelectItem>
                      <SelectItem value={match.teamB.id}>{match.teamB.name}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.type}
                    onValueChange={(v) => updateBanRow(idx, { type: v as 'BAN' | 'PICK' })}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BAN">BAN</SelectItem>
                      <SelectItem value="PICK">PICK</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1">
                    <ChampionSelect
                      value={row.championId}
                      onChange={(k) => updateBanRow(idx, { championId: k })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    onClick={() => removeBanRow(idx)}
                    aria-label={`删除第 ${idx + 1} 条 BP`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addBanRow} className="mt-1">
                <Plus className="h-4 w-4" />
                添加 ban/pick
              </Button>
            </div>
          </Section>

          <Separator />

          {/* ── 双方选手数据 ── */}
          <Section
            title="双方选手数据"
            action={
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={clearStats}
              >
                整段清空
              </Button>
            }
          >
            <div className="space-y-4">
              <StatsTable
                teamName={match.teamA.name}
                rows={statsA}
                onUpdate={(i, patch) => updateStatRow('A', i, patch)}
              />
              <StatsTable
                teamName={match.teamB.name}
                rows={statsB}
                onUpdate={(i, patch) => updateStatRow('B', i, patch)}
              />
            </div>
          </Section>

          <Separator />

          {/* ── MVP ── */}
          <Section title="MVP">
            <div className="max-w-xs">
              <Select
                value={mvp ?? '__none__'}
                disabled={!mvpEnabled}
                onValueChange={(v) => {
                  setMvp(v === '__none__' ? null : v);
                  setMvpTouched(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={mvpEnabled ? '选择 MVP' : '需先填写双方数据'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— 不设置 —</SelectItem>
                  {allPlayers.map((p) => (
                    <SelectItem key={p.registrationId} value={p.registrationId}>
                      {p.nickname}（{p.teamName}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!mvpEnabled && (
                <p className="mt-1 text-xs text-muted-foreground">
                  需双方各 5 人数据完整后方可选择 MVP
                </p>
              )}
            </div>
          </Section>

          <Separator />

          {/* ── 胜方 ── */}
          <Section title="胜方">
            <div className="max-w-xs">
              <Select
                value={winnerTeamId ?? '__draft__'}
                onValueChange={(v) => {
                  setWinnerTeamId(v === '__draft__' ? null : v);
                  setWinnerTouched(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择胜方" />
                </SelectTrigger>
                <SelectContent>
                  {/* Hide 草稿 option for already-promoted games */}
                  {!isPromoted && (
                    <SelectItem value="__draft__">存草稿（未定胜负）</SelectItem>
                  )}
                  <SelectItem value={match.teamA.id}>{match.teamA.name} 胜</SelectItem>
                  <SelectItem value={match.teamB.id}>{match.teamB.name} 胜</SelectItem>
                </SelectContent>
              </Select>
              {isPromoted && (
                <p className="mt-1 text-xs text-muted-foreground">
                  已转正局不可退回草稿，请选择胜方队伍
                </p>
              )}
            </div>
          </Section>
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            <LoadingButtonContent loading={saving} loadingText="保存中…">
              保存
            </LoadingButtonContent>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Section helper ────────────────────────────────────────────────────────────

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{title}</Label>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── StatsTable helper ─────────────────────────────────────────────────────────

const STAT_COLS: Array<{ key: keyof StatRow & string; label: string }> = [
  { key: 'kills', label: 'K' },
  { key: 'deaths', label: 'D' },
  { key: 'assists', label: 'A' },
  { key: 'cs', label: 'CS' },
  { key: 'damage', label: '伤害' },
  { key: 'gold', label: '金币' },
];

function StatsTable({
  teamName,
  rows,
  onUpdate,
}: {
  teamName: string;
  rows: StatRow[];
  onUpdate: (idx: number, patch: Partial<StatRow>) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {teamName}：未找到名单快照（需先配置战队阵容）
      </p>
    );
  }

  return (
    <div className="space-y-1 overflow-x-auto">
      <p className="text-xs font-medium text-muted-foreground">{teamName}</p>
      {/* Header row */}
      <div className="grid min-w-[600px] grid-cols-[110px_160px_repeat(6,56px)] gap-1 text-xs text-muted-foreground">
        <span>选手</span>
        <span>英雄</span>
        {STAT_COLS.map((c) => (
          <span key={c.key} className="text-center">
            {c.label}
          </span>
        ))}
      </div>
      {/* Data rows */}
      {rows.map((row, idx) => (
        <div
          key={row.registrationId}
          className="grid min-w-[600px] grid-cols-[110px_160px_repeat(6,56px)] items-center gap-1"
        >
          <span className="truncate text-sm" title={row.nickname}>
            {row.nickname}
          </span>
          <ChampionSelect
            value={row.championId}
            onChange={(k) => onUpdate(idx, { championId: k })}
          />
          {STAT_COLS.map((c) => (
            <Input
              key={c.key}
              type="number"
              min={0}
              value={row[c.key as keyof StatRow] as string}
              onChange={(e) => onUpdate(idx, { [c.key]: e.target.value })}
              className="h-8 px-1 text-center text-xs"
              placeholder="0"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
