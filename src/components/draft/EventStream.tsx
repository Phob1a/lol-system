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
      <div className="flex items-center justify-center rounded-md border px-4 py-6">
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
              ? 'border-l-2 border-primary bg-accent'
              : 'text-muted-foreground',
          ].join(' ')}
        >
          {event.label}
        </div>
      ))}
    </div>
  );
}
