'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArenaCta, ArenaEmptyState, PublicArenaShell } from '@/components/public-arena';
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
      <PublicArenaShell bleed>
        <ArenaEmptyState
          eyebrow="MATCH ARCHIVE"
          title="比赛数据加载中"
          description="正在同步公开比赛数据。"
        />
      </PublicArenaShell>
    );
  }

  if (detail === null) {
    return (
      <PublicArenaShell bleed>
        <ArenaEmptyState
          eyebrow="MATCH ARCHIVE"
          title="比赛不存在或暂未公开"
          description="该比赛还没有可公开的详情。"
          action={<ArenaCta href="/tournament">返回赛事页</ArenaCta>}
        />
      </PublicArenaShell>
    );
  }

  return <MatchDetailView detail={detail} />;
}
