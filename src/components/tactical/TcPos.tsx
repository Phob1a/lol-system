'use client';
/** 5 个位置标签：T/J/M/A/S */
type Pos = 'TOP' | 'JG' | 'MID' | 'ADC' | 'SUP' | string;

type Props = {
  pos: Pos;
  size?: number;
  on?: boolean;
  dim?: boolean;
};

const LETTER: Record<string,string> = { TOP:'T', JG:'J', JUNGLE:'J', MID:'M', ADC:'A', SUP:'S', SUPPORT:'S' };

export function TcPos({ pos, size = 24, on = false, dim = false }: Props) {
  const letter = LETTER[pos] ?? pos[0];
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      width:size, height:size, flexShrink:0, lineHeight:1,
      fontFamily:'var(--tc-font-display)', fontWeight:700, fontSize:size*0.5,
      background: on ? 'var(--tc-cyan)' : 'transparent',
      color: on ? 'var(--tc-bg-0)' : (dim ? 'var(--tc-text-faint)' : 'var(--tc-cyan)'),
      border:`1px solid ${on ? 'var(--tc-cyan)' : (dim ? 'var(--tc-text-faint)' : 'rgba(120,180,255,0.34)')}`,
      boxShadow: on ? '0 0 12px var(--tc-cyan)' : undefined,
    }}>{letter}</span>
  );
}
