'use client';

/**
 * AuditLogView — NEXUS ledger renderer for the admin audit page.
 *
 * Receives pre-fetched events + actor map as props (server fetches, client
 * renders).  Provides action-type filter Chips and monospace Readout rows.
 */

import { useState } from 'react';
import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Chip, { type ChipVariant } from '@/components/nexus/Chip';
import Readout from '@/components/nexus/Readout';
import Kicker from '@/components/nexus/Kicker';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditEventRow {
  id: string;
  seq: number;
  type: string;
  actorId: string;
  payload: unknown;
  createdAt: string; // ISO string (serialised from server)
}

export interface AuditActorRow {
  id: string;
  username: string;
  role: string;
}

interface Props {
  events: AuditEventRow[];
  actors: AuditActorRow[];
  eventLabels: Record<string, string>;
}

// ── Tone mapping (mirrors admin.jsx ACT_TONE) ─────────────────────────────────

const ACT_TONE: Record<string, ChipVariant> = {
  DRAFT_STARTED:   'ac',
  PICK_MADE:       'ac',
  ROUND_STARTED:   'default',
  ORDER_SET:       'default',
  SLOT_REARRANGED: 'default',
  PICK_REVOKED:    'hot',
  ROUND_REWOUND:   'hot',
  DRAFT_RESET:     'hot',
};

function chipVariant(type: string): ChipVariant {
  return ACT_TONE[type] ?? 'default';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTs(iso: string): string {
  // "2025-06-14T14:30:00.000Z" → "2025-06-14 14:30:00"
  return iso.slice(0, 19).replace('T', ' ');
}

function payloadSummary(raw: unknown): string {
  if (raw == null) return '—';
  if (typeof raw === 'string') return raw;
  return JSON.stringify(raw);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuditLogView({ events, actors, eventLabels }: Props) {
  const actorById = new Map(actors.map((a) => [a.id, a]));

  // All unique action types present in the data
  const allTypes: string[] = [
    'ALL',
    ...Array.from(new Set(events.map((e) => e.type))),
  ];

  const [filter, setFilter] = useState<string>('ALL');

  const rows =
    filter === 'ALL' ? events : events.filter((e) => e.type === filter);

  function filterLabel(t: string): string {
    if (t === 'ALL') return '全部';
    return eventLabels[t] ?? t.replace(/_/g, ' ');
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-nexus-ink text-xl font-semibold tracking-tight">
            审计日志
          </span>
          <Kicker>当前赛事选秀事件流</Kicker>
        </div>
        <Readout className="text-[10px] text-nexus-faint">IMMUTABLE</Readout>
      </div>

      {/* ── Action-type filter Chips ── */}
      <div className="flex flex-wrap gap-2">
        {allTypes.map((t) => {
          const active = filter === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              aria-pressed={active}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-accent rounded-[var(--radius-nexus)]"
            >
              <Chip
                variant={active ? 'ac' : 'default'}
                className={
                  active
                    ? ''
                    : 'opacity-60 hover:opacity-100 transition-opacity duration-150'
                }
              >
                {filterLabel(t)}
                {t === 'ALL' && (
                  <span className="text-nexus-faint ml-[3px]">
                    ({events.length})
                  </span>
                )}
              </Chip>
            </button>
          );
        })}
      </div>

      {/* ── Ledger panel ── */}
      {rows.length === 0 ? (
        <p className="font-mono text-[12px] text-nexus-faint">
          暂无事件 · 启动选秀后将在此记录
        </p>
      ) : (
        <Panel>
          <PanelHead
            title={`LEDGER · ${rows.length}`}
            actions={
              <Readout className="text-[10px] text-nexus-faint">
                IMMUTABLE
              </Readout>
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['SEQ', '时间', '操作', '执行者', '详情'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-[10px] text-left font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-nexus-faint border-b border-nexus-line"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const actor = actorById.get(e.actorId);
                  return (
                    <tr
                      key={e.id}
                      className="hover:bg-nexus-panel-2/40 transition-colors duration-100"
                    >
                      {/* SEQ */}
                      <td className="px-4 py-[10px] border-b border-nexus-line/35">
                        <Readout className="text-[11px] text-nexus-faint">
                          #{e.seq}
                        </Readout>
                      </td>

                      {/* Timestamp — tabular-nums via Readout */}
                      <td className="px-4 py-[10px] border-b border-nexus-line/35 whitespace-nowrap">
                        <Readout className="text-[11px] text-nexus-faint">
                          {fmtTs(e.createdAt)}
                        </Readout>
                      </td>

                      {/* Action type chip */}
                      <td className="px-4 py-[10px] border-b border-nexus-line/35">
                        <Chip variant={chipVariant(e.type)}>
                          {eventLabels[e.type] ?? e.type}
                        </Chip>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-[10px] border-b border-nexus-line/35">
                        <Readout className="text-[11.5px] text-nexus-dim">
                          {actor?.username ?? e.actorId.slice(0, 6)}
                        </Readout>
                        {actor && (
                          <span className="ml-1 font-mono text-[10px] text-nexus-faint">
                            · {actor.role}
                          </span>
                        )}
                      </td>

                      {/* Payload summary */}
                      <td className="px-4 py-[10px] border-b border-nexus-line/35 max-w-xs truncate">
                        <span className="font-body text-[12.5px] text-nexus-ink">
                          {payloadSummary(e.payload)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
