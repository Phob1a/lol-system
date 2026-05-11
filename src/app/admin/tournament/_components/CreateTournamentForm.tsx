'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function CreateTournamentForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: '', groupCount: 4, teamsPerGroup: 4, advancingPerGroup: 2,
  });
  const valid = form.advancingPerGroup * form.groupCount === 8 && form.name.trim().length > 0;

  function submit() {
    start(async () => {
      const res = await fetch('/api/tournament/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `failed (${res.status})`);
        return;
      }
      const { tournament } = await res.json();
      toast.success('赛事已创建');
      router.push(`/admin/tournament/${tournament.id}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded border p-4 space-y-3">
      <h2 className="font-medium">创建新赛事</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-sm">
          名称
          <input className="block w-full border rounded p-2 mt-1" value={form.name}
                 onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="text-sm">
          小组数
          <input type="number" className="block w-full border rounded p-2 mt-1" value={form.groupCount}
                 onChange={e => setForm({ ...form, groupCount: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          每组队数
          <input type="number" className="block w-full border rounded p-2 mt-1" value={form.teamsPerGroup}
                 onChange={e => setForm({ ...form, teamsPerGroup: Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          每组出线
          <input type="number" className="block w-full border rounded p-2 mt-1" value={form.advancingPerGroup}
                 onChange={e => setForm({ ...form, advancingPerGroup: Number(e.target.value) })} />
        </label>
      </div>
      <div className="text-sm text-muted-foreground">
        约束:每组出线 × 小组数 = 8 (当前 {form.advancingPerGroup * form.groupCount})
      </div>
      <button
        disabled={!valid || pending}
        onClick={submit}
        className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50"
      >
        {pending ? '创建中…' : '创建赛事'}
      </button>
    </div>
  );
}
