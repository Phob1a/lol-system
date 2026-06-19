'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PlayerRadarScores, PlayerTrendPoint } from '@/lib/tournament/player-stats-service';
import { Section } from './shared';

const RADAR_AXES: Array<{ key: keyof Pick<PlayerRadarScores, 'output' | 'economy' | 'vision' | 'survival' | 'objective' | 'teamfight'>; label: string }> = [
  { key: 'output', label: '输出' },
  { key: 'economy', label: '经济' },
  { key: 'vision', label: '视野' },
  { key: 'survival', label: '生存' },
  { key: 'objective', label: '目标' },
  { key: 'teamfight', label: '团战' },
];

export function AbilityRadar({ radar }: { radar: PlayerRadarScores }) {
  const values = RADAR_AXES.map(({ key }) => radar[key]);
  const hasData = values.some((value) => value !== null);
  const data = RADAR_AXES.map(({ key, label }) => ({
    axis: label,
    value: radar[key] ?? 0,
    ref: 50,
  }));

  return (
    <Section title="能力雷达" subtitle="赛事内分位 (0-100)">
      {!hasData ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无扩展数据</p>
      ) : (
        <>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} outerRadius="72%">
                <defs>
                  <linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: '#64748b' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {/* 50 分位参考环：仅表示赛事中位，不代表赛事均值曲线 */}
                <Radar name="赛事中位(50)" dataKey="ref" stroke="#cbd5e1" strokeDasharray="4 4" fill="none" isAnimationActive={false} />
                <Radar name="分位" dataKey="value" stroke="#2563eb" strokeWidth={2} fill="url(#radarFill)" />
                <Tooltip
                  formatter={(value: number, name: string) => [name === '分位' ? `${value} 分位` : '50 (中位)', name]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {radar.sampleSizeWarning ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              小样本，仅供参考：扩展数据 {radar.sourceGames} 局，对比选手 {radar.comparisonPlayers} 人。
            </p>
          ) : null}
        </>
      )}
    </Section>
  );
}

export function FormTrend({ trends }: { trends: PlayerTrendPoint[] }) {
  const points = trends
    .filter((trend) => trend.damagePercentile !== null || trend.visionPercentile !== null)
    .slice(0, 8)
    .reverse();
  const canDrawLine = points.length >= 3;
  const data = points.map((point) => ({
    label: point.matchLabel,
    damage: point.damagePercentile,
    vision: point.visionPercentile,
  }));

  return (
    <Section title="表现趋势" subtitle="输出 / 视野分位 · 0-100">
      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无趋势数据</p>
      ) : !canDrawLine ? (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">少于 3 场，不画趋势线。</p>
          {points.map((point) => (
            <div
              key={point.gameId}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 rounded-md border bg-muted/20 p-2 text-sm"
            >
              <span className="truncate">{point.matchLabel}</span>
              <span>伤害 {point.damagePercentile ?? '—'}</span>
              <span>视野 {point.visionPercentile ?? '—'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="dmgArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="visArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="damage"
                name="对英雄伤害分位"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#dmgArea)"
                dot={{ r: 3, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="vision"
                name="视野分位"
                stroke="#0f766e"
                strokeWidth={2}
                fill="url(#visArea)"
                dot={{ r: 3, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}
