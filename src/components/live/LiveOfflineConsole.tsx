import { Activity, RadioTower, RotateCw, Signal, Users } from 'lucide-react';
import {
  ArenaCta,
  ArenaPanel,
  ArenaStatCard,
  PublicArenaHud,
  PublicArenaShell,
} from '@/components/public-arena';

const pulseBars = [34, 58, 74, 46, 84, 63, 78, 54, 88, 71, 60, 82];

const feedRows = [
  { index: '01', label: 'BP 阶段等待赛季同步', state: 'WAIT' },
  { index: '02', label: '阵容强度模块待激活', state: 'SYNC' },
  { index: '03', label: '观赛提示将在开播后推送', state: 'INFO' },
];

export function LiveOfflineConsole() {
  return (
    <PublicArenaShell
      className="min-h-screen"
      hud={
        <PublicArenaHud
          eyebrow="LOL-SYSTEM / LIVE SPECTATOR"
          title="直播观赛控制台"
          signals={[{ label: 'STREAM', detail: 'OFFLINE' }, { label: 'SYNC', detail: 'STANDBY' }]}
          actions={<ArenaCta href="/">返回首页</ArenaCta>}
        />
      }
      contentClassName="max-w-7xl"
    >
      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <ArenaPanel eyebrow="/LIVE SPECTATOR" title="LIVE COMMAND VIEW" className="arena-scanline p-5 md:p-7">
          <p className="max-w-2xl text-sm leading-7 text-slate-300">
            直播页保持控制台形态；当前没有可公开选秀赛季，开播后这里会同步 BP、双方阵容、事件流和下一步提示。
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <ArenaStatCard icon={RadioTower} label="BP PHASE" value="OFF" detail="等待开播" />
            <ArenaStatCard icon={Users} label="TEAMS" value="0" detail="暂无队伍在线" tone="amber" />
            <ArenaStatCard icon={Activity} label="EVENTS" value="0" detail="事件流待同步" tone="emerald" />
          </div>

          <div className="mt-6 rounded-sm border border-cyan-200/15 bg-slate-950/35">
            {feedRows.map((row) => (
              <div
                key={row.index}
                className="grid grid-cols-[3rem_1fr_4rem] items-center gap-3 border-b border-cyan-200/10 px-4 py-3 last:border-b-0"
              >
                <span className="font-mono text-sm font-black text-cyan-200">{row.index}</span>
                <span className="text-sm text-slate-200">{row.label}</span>
                <span className="text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {row.state}
                </span>
              </div>
            ))}
          </div>
        </ArenaPanel>

        <ArenaPanel eyebrow="STREAM SYNCED" title="TEAM PULSE" className="p-5 md:p-6">
          <div className="flex h-28 items-end gap-2">
            {pulseBars.map((height, index) => (
              <span
                key={`${height}-${index}`}
                className="flex-1 rounded-t-sm bg-gradient-to-t from-cyan-500/35 via-cyan-200/75 to-white shadow-[0_0_18px_rgba(94,231,255,0.35)]"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <span className="inline-flex items-center gap-2 border border-cyan-200/15 bg-cyan-200/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
              <Signal className="h-3.5 w-3.5" />
              BP Phase
            </span>
            <span className="inline-flex items-center gap-2 border border-cyan-200/15 bg-cyan-200/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
              <RotateCw className="h-3.5 w-3.5" />
              Auto Refresh
            </span>
            <span className="inline-flex items-center gap-2 border border-cyan-200/15 bg-cyan-200/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
              <Activity className="h-3.5 w-3.5" />
              EVENT FEED
            </span>
          </div>
        </ArenaPanel>
      </div>
    </PublicArenaShell>
  );
}
