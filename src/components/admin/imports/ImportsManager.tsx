'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import NexusButton from '@/components/nexus/NexusButton';
import Chip from '@/components/nexus/Chip';
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
      {/* Page header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="font-display text-lg font-semibold text-nexus-ink">对局导入</h1>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-nexus-faint">
            待审核的 LCU 对局记录
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          <NexusButton
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <LoadingButtonContent loading={uploading} loadingText="上传中…">
              上传 JSON
            </LoadingButtonContent>
          </NexusButton>
        </div>
      </div>

      {/* Table panel */}
      <Panel>
        <PanelHead
          title={`导入队列 · ${imports.length}`}
          actions={
            listLoading ? (
              <span className="font-mono text-[10px] text-nexus-faint">加载中…</span>
            ) : (
              <Chip variant="ac">{imports.length} PENDING</Chip>
            )
          }
        />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-nexus-line hover:bg-transparent">
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-faint">时间</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-faint">来源</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-faint">游戏 ID</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-faint">模式</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-faint">时长</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-faint">状态</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-faint">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!listLoading && imports.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center font-mono text-[11px] text-nexus-faint"
                  >
                    暂无待审导入
                  </TableCell>
                </TableRow>
              )}
              {imports.map((imp) => {
                const busy = busyIds.has(imp.id);
                return (
                  <TableRow key={imp.id} className="border-nexus-line/40">
                    <TableCell className="font-mono text-[11px] tabular-nums text-nexus-dim">
                      {formatDate(imp.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Chip>{imp.source}</Chip>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] tabular-nums text-nexus-ink">
                      {imp.externalGameId}
                    </TableCell>
                    <TableCell className="text-[12px] text-nexus-ink">
                      {imp.gameMode ?? '—'}
                      {imp.queueId != null ? (
                        <span className="ml-1 font-mono text-[10px] text-nexus-faint">
                          Q{imp.queueId}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-[12px] tabular-nums text-nexus-dim">
                      {formatDuration(imp.durationSeconds)}
                    </TableCell>
                    <TableCell>
                      <Chip variant="ac">{imp.status}</Chip>
                      {imp.committedGameId && (
                        <span className="ml-2 font-mono text-[10px] text-nexus-faint">
                          → {imp.committedGameId.slice(0, 8)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <NexusButton
                          size="sm"
                          variant="primary"
                          disabled={busy}
                          onClick={() => setReviewingId(imp.id)}
                        >
                          审核
                        </NexusButton>
                        <NexusButton
                          size="sm"
                          disabled={busy}
                          className="hover:border-nexus-bad/60 hover:text-nexus-bad"
                          onClick={() => void handleDiscard(imp.id)}
                        >
                          丢弃
                        </NexusButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>

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
