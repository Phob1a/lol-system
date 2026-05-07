import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guards';
import { prisma } from '@/lib/db';
import { POSITIONS } from '@/lib/players/schema';
import { POSITION_LABEL } from '@/components/players/positions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') ?? 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'json') {
    return NextResponse.json({ error: 'format 必须为 csv 或 json' }, { status: 400 });
  }

  const teams = await prisma.team.findMany({
    include: {
      captain: { select: { id: true, gameId: true, nickname: true, cost: true } },
      slots: {
        include: {
          player: { select: { id: true, gameId: true, nickname: true, cost: true } },
        },
      },
    },
  });

  if (teams.length === 0) {
    return NextResponse.json({ error: '当前无战队，请先启动选秀' }, { status: 409 });
  }

  // Sort teams by captain gameId; sort slots in POSITIONS enum order.
  const sorted = teams
    .slice()
    .sort((a, b) => a.captain.gameId.localeCompare(b.captain.gameId))
    .map((t) => ({
      captain: t.captain,
      budgetLeft: t.budgetLeft,
      slots: t.slots
        .slice()
        .sort(
          (a, b) =>
            POSITIONS.indexOf(a.position as (typeof POSITIONS)[number]) -
            POSITIONS.indexOf(b.position as (typeof POSITIONS)[number]),
        ),
    }));

  const filenameDate = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    const body = {
      exportedAt: new Date().toISOString(),
      teams: sorted.map((t) => ({
        captainGameId: t.captain.gameId,
        captainNickname: t.captain.nickname,
        budgetLeft: t.budgetLeft,
        slots: t.slots.map((s) => ({
          position: s.position,
          player: s.player
            ? {
                gameId: s.player.gameId,
                nickname: s.player.nickname,
                cost: s.player.cost,
                isCaptain: s.player.id === t.captain.id,
              }
            : null,
        })),
      })),
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="lol-draft-${filenameDate}.json"`,
      },
    });
  }

  // CSV: one row per (team, position). Empty slots produce a row with empty player fields.
  const headers = [
    '战队队长游戏ID',
    '战队队长昵称',
    '剩余预算',
    '位置',
    '选手游戏ID',
    '选手昵称',
    '选手费用',
    '是否队长',
  ];
  const rows: string[] = [headers.map(csvEscape).join(',')];
  for (const t of sorted) {
    for (const s of t.slots) {
      const isCaptain = s.player?.id === t.captain.id;
      rows.push(
        [
          t.captain.gameId,
          t.captain.nickname,
          t.budgetLeft,
          POSITION_LABEL[s.position],
          s.player?.gameId ?? '',
          s.player?.nickname ?? '',
          s.player?.cost ?? '',
          isCaptain ? '是' : '',
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }

  // BOM so Excel recognizes UTF-8 with Chinese.
  const csv = '﻿' + rows.join('\r\n') + '\r\n';
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lol-draft-${filenameDate}.csv"`,
    },
  });
}
