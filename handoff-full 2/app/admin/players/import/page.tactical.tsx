import Link from 'next/link';
import { ImportUpload } from '@/components/players/ImportUpload.tactical';

export default function PlayersImportPage() {
  return (
    <div className="tc-board" style={{ minHeight: '100%', padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 4, height: 28, background: 'var(--tc-amber)',
            boxShadow: '0 0 12px var(--tc-amber)' }} />
          <div>
            <div className="tc-h1" style={{ fontSize: 22 }}>
              ROSTER<span style={{ color: 'var(--tc-amber)' }}>//</span>IMPORT
            </div>
            <div className="tc-label">BATCH UPLOAD · CSV / XLSX</div>
          </div>
        </div>
        <Link href="/admin/players" className="tc-btn">◀ BACK TO ROSTER</Link>
      </header>
      <div className="tc-divider" />
      <ImportUpload />
    </div>
  );
}
