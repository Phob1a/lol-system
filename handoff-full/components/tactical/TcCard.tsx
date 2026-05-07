'use client';
import { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** 标贴：左上小标 */
  tab?: string;
  /** 是否渲染 4 角发光括号 */
  corners?: boolean;
};

export function TcCard({ children, className, style, tab, corners = true }: Props) {
  return (
    <div className={`tc-card ${className ?? ''}`} style={{ padding:14, ...style }}>
      {corners && (<>
        <span className="corner tl"/><span className="corner tr"/>
        <span className="corner bl"/><span className="corner br"/>
      </>)}
      {tab && (
        <span className="tc-label" style={{
          position:'absolute', top:0, left:14, transform:'translateY(-50%)',
          padding:'2px 8px', background:'var(--tc-bg-0)', color:'var(--tc-cyan)',
          border:'1px solid var(--tc-cyan)' }}>
          ▸ {tab}
        </span>
      )}
      {children}
    </div>
  );
}
