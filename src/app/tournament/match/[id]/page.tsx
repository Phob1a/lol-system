'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MatchDetailView, type MatchDetail } from '@/components/tournament/MatchDetailView';

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<MatchDetail | null | undefined>(undefined);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/tournament/public/match/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setDetail(null);
          return;
        }
        const body = await res.json();
        setDetail(body.detail ?? null);
      })
      .catch(() => setDetail(null));
  }, [params?.id]);

  if (detail === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">比赛不存在或暂未公开</p>
      </div>
    );
  }

  return <MatchDetailView detail={detail} />;
}
