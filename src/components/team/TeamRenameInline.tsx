'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

export function TeamRenameInline({
  teamId,
  currentName,
  canEdit,
  onRenamed,
}: {
  teamId: string;
  currentName: string;
  canEdit: boolean;
  onRenamed?: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentName);
  const [pending, start] = useTransition();

  function save() {
    const next = draft.trim();
    if (next === currentName) { setEditing(false); return; }
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `重命名失败 (${res.status})`);
        return;
      }
      toast.success('已更新');
      setEditing(false);
      onRenamed?.(next);
    });
  }

  if (!canEdit) {
    return <span>{currentName}</span>;
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span>{currentName}</span>
        <button onClick={() => { setDraft(currentName); setEditing(true); }}
                className="text-xs underline text-muted-foreground">重命名</button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input value={draft} onChange={e => setDraft(e.target.value)}
             className="border rounded p-1 text-sm" autoFocus
             onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
      <button disabled={pending} onClick={save}
              className="text-xs rounded bg-primary text-primary-foreground px-2 py-1">
        {pending ? '…' : '保存'}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs underline">取消</button>
    </span>
  );
}
