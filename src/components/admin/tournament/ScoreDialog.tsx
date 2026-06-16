'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { GameDetailEditor } from './GameDetailEditor';
import type { GameDetailInitial } from './GameDetailEditor';

type MatchRef = {
  id: string;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  winnerTeamId: string | null;
  status: string;
  version: number;
  bestOf: number;
};

type Game = GameDetailInitial;

type RosterPlayer = { registrationId: string; nickname: string };
type Roster = { teamId: string; players: RosterPlayer[] };

type Props = {
  match: MatchRef | null;
  open: boolean;
  onClose: () => void;
  refetch: () => Promise<void>;
};

export function ScoreDialog({ match, open, onClose, refetch }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [recordingTeamId, setRecordingTeamId] = useState<string | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);

  // GameDetailEditor state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGameId, setDetailGameId] = useState<string | undefined>(undefined);
  const [detailInitial, setDetailInitial] = useState<GameDetailInitial | null>(null);

  const fetchGames = useCallback(async (matchId: string) => {
    setLoadingGames(true);
    try {
      const res = await fetch(`/api/tournament/admin/matches/${matchId}`);
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as {
          match?: {
            games?: Game[];
            rosters?: Roster[];
          };
        };
        setGames(data.match?.games ?? []);
        setRosters(data.match?.rosters ?? []);
      }
    } catch {
      // ignore; games shows empty
    } finally {
      setLoadingGames(false);
    }
  }, []);

  useEffect(() => {
    if (open && match) {
      void fetchGames(match.id);
    } else {
      setGames([]);
      setRosters([]);
    }
  }, [open, match, fetchGames]);

  // Close detail editor whenever ScoreDialog itself closes
  useEffect(() => {
    if (!open) {
      setDetailOpen(false);
    }
  }, [open]);

  if (!match) return null;

  const teamA = match.teamA;
  const teamB = match.teamB;
  const isFinished = match.status === 'FINISHED';
  const winner =
    match.winnerTeamId === teamA?.id
      ? teamA?.name
      : match.winnerTeamId === teamB?.id
        ? teamB?.name
        : null;

  async function handleRecord(winnerTeamId: string) {
    if (!match) return;
    setRecordingTeamId(winnerTeamId);
    try {
      const res = await fetch(`/api/tournament/admin/matches/${match.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: match.version, winnerTeamId }),
      });
      if (res.ok) {
        await refetch();
        await fetchGames(match.id);
      } else if (res.status === 409) {
        toast.error('该比赛已被修改，已刷新');
        await refetch();
        await fetchGames(match.id);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error ?? '录入失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '录入失败');
    } finally {
      setRecordingTeamId(null);
    }
  }

  async function handleDeleteGame(gameId: string) {
    if (!match) return;
    setDeletingGameId(gameId);
    try {
      const res = await fetch(`/api/tournament/admin/matches/${match.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: match.version, gameId }),
      });
      if (res.ok) {
        await refetch();
        await fetchGames(match.id);
      } else if (res.status === 409) {
        toast.error('该比赛已被修改，已刷新');
        await refetch();
        await fetchGames(match.id);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error ?? '删除失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeletingGameId(null);
    }
  }

  function teamName(winnerTeamId: string | null) {
    if (!winnerTeamId) return '未知';
    if (winnerTeamId === teamA?.id) return teamA.name;
    if (winnerTeamId === teamB?.id) return teamB.name;
    return winnerTeamId;
  }

  function openDetailForGame(game: Game) {
    setDetailGameId(game.id);
    setDetailInitial(game);
    setDetailOpen(true);
  }

  function openDetailForNew() {
    setDetailGameId(undefined);
    setDetailInitial(null);
    setDetailOpen(true);
  }

  async function handleDetailRefetch() {
    await refetch();
    if (match) {
      await fetchGames(match.id);
    }
  }

  // Build match shape required by GameDetailEditor (needs bestOf + non-null teams)
  const editorMatch =
    teamA && teamB
      ? {
          id: match.id,
          version: match.version,
          bestOf: match.bestOf,
          teamA,
          teamB,
        }
      : null;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {teamA?.name ?? '？'} vs {teamB?.name ?? '？'}
            </DialogTitle>
            <DialogDescription className="sr-only">录入比赛结果</DialogDescription>
          </DialogHeader>

          {isFinished && winner && (
            <Badge variant="secondary" className="w-fit">
              已结束 · 胜者 {winner}
            </Badge>
          )}

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">已录局数</p>
            {loadingGames ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : games.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无录入</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {games.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="shrink-0">第 {g.index} 局</span>
                    <span className="flex-1 text-muted-foreground">
                      {g.winnerTeamId ? `${teamName(g.winnerTeamId)} 胜` : '草稿中'}
                    </span>
                    {/* Completeness badges */}
                    <span className="flex shrink-0 gap-1">
                      {g.isDraft && (
                        <Badge variant="outline" className="text-xs">草稿</Badge>
                      )}
                      {g.hasBans && (
                        <Badge variant="secondary" className="text-xs">BP</Badge>
                      )}
                      {g.hasStats && (
                        <Badge variant="secondary" className="text-xs">数据</Badge>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-2 text-xs"
                      disabled={!editorMatch}
                      onClick={() => openDetailForGame(g)}
                    >
                      详细
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-destructive"
                      disabled={deletingGameId === g.id}
                      onClick={() => void handleDeleteGame(g.id)}
                      aria-label={`删除第 ${g.index} 局`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {teamA && (
              <Button
                className="flex-1"
                variant={isFinished ? 'outline' : 'default'}
                disabled={recordingTeamId !== null}
                onClick={() => void handleRecord(teamA.id)}
              >
                <LoadingButtonContent loading={recordingTeamId === teamA.id} loadingText="录入中…">
                  {teamA.name} 胜
                </LoadingButtonContent>
              </Button>
            )}
            {teamB && (
              <Button
                className="flex-1"
                variant={isFinished ? 'outline' : 'default'}
                disabled={recordingTeamId !== null}
                onClick={() => void handleRecord(teamB.id)}
              >
                <LoadingButtonContent loading={recordingTeamId === teamB.id} loadingText="录入中…">
                  {teamB.name} 胜
                </LoadingButtonContent>
              </Button>
            )}
          </div>

          <div className="border-t pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!editorMatch}
              onClick={openDetailForNew}
            >
              + 详细录入一局
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {editorMatch && (
        <GameDetailEditor
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          match={editorMatch}
          gameId={detailGameId}
          initial={detailInitial}
          rosters={rosters}
          refetch={handleDetailRefetch}
        />
      )}
    </>
  );
}
