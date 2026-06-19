'use client';

import { useRouter } from 'next/navigation';
import type { Tournament } from '@prisma/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Props = {
  tournaments: Tournament[];
  selectedId: string;
  className?: string;
};

export function SeasonSelector({ tournaments, selectedId, className }: Props) {
  const router = useRouter();

  return (
    <Select
      value={selectedId}
      onValueChange={(id) => router.push(`/live?season=${id}`)}
    >
      <SelectTrigger
        className={cn(
          'w-48 border-cyan-200/25 bg-cyan-200/5 text-cyan-50',
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {tournaments.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
