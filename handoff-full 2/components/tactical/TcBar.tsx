'use client';
type Props = {
  pct: number;          // 0..1
  w?: number | string;
  color?: string;
  label?: string;
  value?: string;
  animated?: boolean;
};

export function TcBar({ pct, w = 180, color = 'var(--tc-cyan)', label, value, animated }: Props) {
  return (
    <div style={{ width: w as any }}>
      {label && (
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
          <span className="tc-label">{label}</span>
          {value && <span className="tc-num" style={{ fontSize:11, color }}>{value}</span>}
        </div>
      )}
      <div style={{ position:'relative', height:6, background:'var(--tc-bg-0)',
        border:`1px solid ${color}40` }}>
        <div style={{ position:'absolute', inset:0, width: `${Math.min(1, Math.max(0, pct))*100}%`,
          background: color, boxShadow:`0 0 8px ${color}80`,
          transition:'width .6s cubic-bezier(.2,.7,.3,1)',
          backgroundImage: animated
            ? 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.18) 6px 7px, transparent 7px 14px)'
            : undefined,
          animation: animated ? 'tc-stream .8s linear infinite' : undefined,
        }}/>
      </div>
    </div>
  );
}
