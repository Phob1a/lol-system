type EventItem = {
  id: string;
  label: string;
};

type Props = {
  events: EventItem[];
};

export function EventStream({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md bg-slate-900/40 border border-slate-700/40 px-4 py-6">
        <span className="text-muted-foreground text-sm font-mono">暂无事件</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {events.map((event, idx) => (
        <div
          key={event.id}
          className={[
            'rounded px-3 py-2 text-sm font-mono border transition-colors',
            idx === 0
              ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-200'
              : 'bg-slate-900/40 border-slate-700/30 text-slate-400',
          ].join(' ')}
        >
          {event.label}
        </div>
      ))}
    </div>
  );
}
