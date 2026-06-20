import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import LiveDot from '@/components/nexus/LiveDot';
import Chip from '@/components/nexus/Chip';

type EventItem = {
  id: string;
  label: string;
};

type Props = {
  events: EventItem[];
};

export function EventStream({ events }: Props) {
  return (
    <Panel scan className="flex flex-col h-full">
      <PanelHead
        title="选秀事件流"
        actions={<LiveDot />}
      />

      {events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-nexus-faint">
            暂无事件
          </span>
        </div>
      ) : (
        <div className="flex flex-col py-1 overflow-y-auto">
          {events.map((event, idx) => (
            <div
              key={event.id}
              className="grid px-4 py-2.5"
              style={{
                gridTemplateColumns: 'auto 1fr',
                gap: 10,
                borderBottom:
                  idx < events.length - 1
                    ? '1px solid rgb(var(--line) / 0.4)'
                    : 'none',
              }}
            >
              {/* Index / seq marker */}
              <span
                className="font-mono tabular-nums text-[10px] mt-[2px]"
                style={{ color: 'rgb(var(--faint))' }}
              >
                {String(events.length - idx).padStart(2, '0')}
              </span>
              <div>
                {/* Latest event gets an accent chip */}
                {idx === 0 && (
                  <Chip variant="ac" className="mb-1.5">
                    最新
                  </Chip>
                )}
                <div
                  className="font-display text-[12.5px] leading-snug"
                  style={{
                    color: idx === 0 ? 'rgb(var(--ink))' : 'rgb(var(--dim))',
                  }}
                >
                  {event.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
