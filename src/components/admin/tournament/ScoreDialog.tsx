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

type MatchRef = {
  id: string;
  teamA: { id: string; name: string } | null;
  teamB: { id: string; name: string } | null;
  winnerTeamId: string | null;
  status: string;
  version: number;
};

type Game = {
  id: string;
  index: number;
  winnerTeamId: string | null;
};

type Props = {
  match: MatchRef | null;
  open: boolean;
  onClose: () => void;
  refetch: () => Promise<void>;
};

export function ScoreDialog({ match, open, onClose, refetch }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [recordingTeamId, setRecordingTeamId] = useState<string | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);

  const fetchGames = useCallback(async (matchId: string) => {
    setLoadingGames(true);
    try {
      const res = await fetch(`/api/tournament/admin/matches/${matchId}`);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setGames((data.match?.games as Game[]) ?? []);
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
    }
  }, [open, match, fetchGames]);

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
        const data = await res.json().catch(() => ({}));
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
        const data = await res.json().catch(() => ({}));
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

  return (
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
                <li key={g.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>第 {g.index} 局</span>
                  <span className="text-muted-foreground">{teamName(g.winnerTeamId)} 胜</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
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

        <div className="flex gap-3">
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
      </DialogContent>
    </Dialog>
  );
}
