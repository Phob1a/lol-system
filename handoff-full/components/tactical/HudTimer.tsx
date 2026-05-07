'use client';
/** Tactical · 圆环倒计时
 *  推荐用 deadline (Unix ms) 而不是 value，避免客户端漂移
 */
import { useEffect, useState } from 'react';

type Props = {
  /** 服务端权威时间戳 (ms)，到点归零 */
  deadline?: number;
  /** 或直接给秒值 */
  value?: number;
  max: number;
  size?: number;
  serverOffset?: number;
};

export function HudTimer({ deadline, value, max, size = 110, serverOffset = 0 }: Props) {
  const [v, setV] = useState(() => computeValue(deadline, value, serverOffset));
  useEffect(() => {
    if (deadline == null && value != null) { setV(value); return; }
    const id = setInterval(() => setV(computeValue(deadline, value, serverOffset)), 250);
    return () => clearInterval(id);
  }, [deadline, value, serverOffset]);

  const r = size/2 - 6;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, v/max));
  const danger = v <= 8;
  const warn   = v <= 15;
  const col = danger ? 'var(--tc-red)' : warn ? 'var(--tc-amber)' : 'var(--tc-cyan)';

  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ overflow:'visible' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="rgba(120,180,255,0.18)" strokeWidth={3}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={col} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition:'stroke-dashoffset .3s linear, stroke .3s' }}/>
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', lineHeight:1 }}>
        <span className="tc-display" style={{ fontSize:size*0.4, color:col,
          textShadow:`0 0 14px ${col}`,
          animation: danger ? 'tc-blink .5s step-end infinite' : undefined }}>
          {String(Math.max(0, Math.ceil(v))).padStart(2,'0')}
        </span>
        <span className="tc-label" style={{ fontSize:9, marginTop:2 }}>SEC</span>
      </div>
    </div>
  );
}

function computeValue(deadline?: number, value?: number, offset = 0) {
  if (deadline != null) return Math.max(0, (deadline - (Date.now() + offset)) / 1000);
  return value ?? 0;
}
