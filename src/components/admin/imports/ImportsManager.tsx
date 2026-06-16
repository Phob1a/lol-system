'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import { ImportReviewDialog } from './ImportReviewDialog';

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportRow = {
  id: string;
  createdAt: string;
  source: string;
  status: string;
  externalGameId: string;
  gameMode: string | null;
  gameType: string | null;
  queueId: number | null;
  mapId: number | null;
  gameCreation: string | null;
  durationSeconds: number | null;
  committedGameId: string | null;
  note: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(secs: number | null): string {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ImportsManager() {
  // ── list state ────────────────────────────────────────────────────────────

  const [imports, setImports] = useState<ImportRow[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // ── per-row busy ──────────────────────────────────────────────────────────

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // ── review dialog ─────────────────────────────────────────────────────────

  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // ── upload ────────────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // ── fetch list ────────────────────────────────────────────────────────────

  async function fetchList() {
    setListLoading(true);
    try {
      const res = await fetch('/api/tournament/admin/imports?status=PENDING');
      if (!res.ok) {
        toast.error('加载导入列表失败');
        return;
      }
      const body = (await res.json()) as { imports: ImportRow[] };
      setImports(body.imports);
    } catch {
      toast.error('加载导入列表失败');
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── upload handler ────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      toast.error('文件解析失败，请确认是有效 JSON');
      return;
    }

    setUploading(true);
    try {
      const res = await fetch('/api/tournament/imports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (res.status === 201) {
        toast.success('上传成功，已进入待审队列');
        await fetchList();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? '上传失败');
      }
    } catch {
      toast.error('上传失败');
    } finally {
      setUploading(false);
    }
  }

  // ── discard handler ───────────────────────────────────────────────────────

  async function handleDiscard(id: string) {
    if (!window.confirm('确认丢弃该导入？此操作无法撤销。')) return;
    setBusy(id, true);
    try {
      const res = await fetch(`/api/tournament/admin/imports/${id}/discard`, {
        method: 'POST',
      });
      if (res.ok) {
        toast.success('已丢弃');
        await fetchList();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? '操作失败');
      }
    } catch {
      toast.error('操作失败');
    } finally {
      setBusy(id, false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">对局导入</h1>
          <p className="text-sm text-muted-foreground">待审核的 LCU 对局记录</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <LoadingButtonContent loading={uploading} loadingText="上传中…">
              上传 JSON
            </LoadingButtonContent>
          </Button>
        </div>
      </div>

      {/* Table */}
      {listLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>游戏 ID</TableHead>
              <TableHead>模式</TableHead>
              <TableHead>时长</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  暂无待审导入
                </TableCell>
              </TableRow>
            )}
            {imports.map((imp) => {
              const busy = busyIds.has(imp.id);
              return (
                <TableRow key={imp.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(imp.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{imp.source}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {imp.externalGameId}
                  </TableCell>
                  <TableCell className="text-sm">
                    {imp.gameMode ?? '—'}
                    {imp.queueId != null ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        Q{imp.queueId}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDuration(imp.durationSeconds)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{imp.status}</Badge>
                    {imp.committedGameId && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        → {imp.committedGameId.slice(0, 8)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={busy}
                        onClick={() => setReviewingId(imp.id)}
                      >
                        审核
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void handleDiscard(imp.id)}
                      >
                        丢弃
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Review dialog */}
      {reviewingId && (
        <ImportReviewDialog
          importId={reviewingId}
          onClose={() => setReviewingId(null)}
          onCommitted={() => {
            setReviewingId(null);
            void fetchList();
          }}
        />
      )}
    </div>
  );
}
