'use client';
import { useEffect, useState } from 'react';

interface EventRow {
  id: string;
  type: string;
  payload: unknown;
  actorId: string;
  seq: number;
  createdAt: string;
}

export function AuditTab({ tournamentId }: { tournamentId: string }) {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tournament/${tournamentId}/events?limit=200`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setRows(d.events ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div>加载审计日志…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border">
        <thead className="bg-muted">
          <tr>
            <th className="p-2 text-left">Seq</th>
            <th className="p-2 text-left">类型</th>
            <th className="p-2 text-left">操作者</th>
            <th className="p-2 text-left">时间</th>
            <th className="p-2 text-left">Payload</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t">
              <td className="p-2 font-mono">{r.seq}</td>
              <td className="p-2">{r.type}</td>
              <td className="p-2 font-mono text-xs">{r.actorId.slice(0, 8)}</td>
              <td className="p-2">{new Date(r.createdAt).toLocaleString()}</td>
              <td className="p-2 font-mono text-xs max-w-md truncate" title={JSON.stringify(r.payload)}>
                {JSON.stringify(r.payload)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">暂无事件</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
