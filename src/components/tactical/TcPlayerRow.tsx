'use client';
/** Tactical · 候选选手行（用于 Captain 候选池） */
import { TcPos } from './TcPos';

type Props = {
  id: number;
  name: string;
  primary?: string[];
  secondary?: string[];
  cost: number;
  on?: boolean;
  picked?: boolean;
  hot?: boolean;
  onClick?: () => void;
};

export function TcPlayerRow({ id, name, primary = [], secondary = [], cost, on, picked, hot, onClick }: Props) {
  return (
    <div onClick={onClick} style={{
      display:'grid', gridTemplateColumns:'40px 1fr auto auto', gap:10, alignItems:'center',
      padding:'7px 12px', cursor: picked ? 'not-allowed' : 'pointer',
      background: on
        ? 'rgba(0,229,255,0.10)'
        : picked ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${on ? 'var(--tc-cyan)' : 'var(--tc-line)'}`,
      borderLeft: `3px solid ${on ? 'var(--tc-cyan)' : 'var(--tc-purple)'}`,
      opacity: picked ? 0.4 : 1,
      position:'relative',
      boxShadow: on ? 'inset 0 0 14px rgba(0,229,255,0.18)' : undefined,
      transition: 'all .12s',
    }}>
      {hot && (
        <span style={{
          position:'absolute', top:-7, right:8, padding:'1px 6px',
          background:'var(--tc-amber)', color:'var(--tc-bg-0)',
          fontFamily:'var(--tc-font-mono)', fontSize:10, fontWeight:700, letterSpacing:1,
        }}>★ HOT</span>
      )}
      <span className="tc-mono" style={{ fontSize:10, color:'var(--tc-text-faint)', textAlign:'center' }}>
        #{String(id).padStart(3,'0')}
      </span>
      <div style={{ minWidth:0 }}>
        <div className="tc-display" style={{ fontSize:14, lineHeight:1.1,
          color: on ? 'var(--tc-cyan)' : 'var(--tc-text)',
          textDecoration: picked ? 'line-through' : undefined }}>
          {name}
        </div>
      </div>
      <div style={{ display:'flex', gap:3 }}>
        {primary.map((p,i)  => <TcPos key={'p'+i} pos={p} size={18} on/>)}
        {secondary.map((p,i)=> <TcPos key={'s'+i} pos={p} size={18}/>)}
      </div>
      <span className="tc-num" style={{ fontSize:14, color:'var(--tc-amber)', minWidth:44, textAlign:'right' }}>
        {cost}<span className="tc-mono" style={{ fontSize:10, color:'var(--tc-text-dim)', marginLeft:2 }}>CR</span>
      </span>
    </div>
  );
}
