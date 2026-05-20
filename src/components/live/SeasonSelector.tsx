'use client';

import { useRouter } from 'next/navigation';
import type { Season } from '@prisma/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  seasons: Season[];
  selectedId: string;
};

export function SeasonSelector({ seasons, selectedId }: Props) {
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
        {seasons.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
