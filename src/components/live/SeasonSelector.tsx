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

type Props = {
  tournaments: Tournament[];
  selectedId: string;
};

export function SeasonSelector({ tournaments, selectedId }: Props) {
  const router = useRouter();

  return (
    <Select
      value={selectedId}
      onValueChange={(id) => router.push(`/live?season=${id}`)}
    >
      <SelectTrigger className="w-48">
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
