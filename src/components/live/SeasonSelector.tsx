'use client';

import { useRouter } from 'next/navigation';
import type { Tournament } from '@prisma/client';

type Props = {
  tournaments: Tournament[];
  selectedId: string;
};

export function SeasonSelector({ tournaments, selectedId }: Props) {
  const router = useRouter();

  return (
    <select
      value={selectedId}
      onChange={(e) => router.push(`/live?season=${e.target.value}`)}
      className="h-8 px-2 pr-6 font-mono text-[11px] uppercase tracking-[0.1em] border border-nexus-line rounded-[var(--radius-nexus)] cursor-pointer appearance-none transition-colors focus:outline-none focus:border-nexus-accent"
      style={{
        background: 'rgb(var(--panel-2))',
        color: 'rgb(var(--ink))',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235A7080'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}
    >
      {tournaments.map((t) => (
        <option
          key={t.id}
          value={t.id}
          style={{ background: 'rgb(var(--panel-2))', color: 'rgb(var(--ink))' }}
        >
          {t.name}
        </option>
      ))}
    </select>
  );
}
