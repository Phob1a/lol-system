'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type ImportResult = {
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: { row: number; gameId: string; errors: string[] }[];
  duplicates: { gameId: string; rows: number[] }[];
  truncated: boolean;
};

export function ImportUpload() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) {
      toast.error('请选择文件');
      return;
    }
    setSubmitting(true);
    setResult(null);
    const res = await fetch('/api/players/import', { method: 'POST', body: data });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      toast.error(body.error ?? '导入失败');
      return;
    }
    setResult(body as ImportResult);
    toast.success(`新增 ${body.inserted} · 更新 ${body.updated} · 跳过 ${body.skipped?.length ?? 0}`);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="tc-card" style={{ padding: 18, position: 'relative' }}>
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

        <div className="tc-h2" style={{ marginBottom: 6 }}>UPLOAD // CSV · XLSX</div>
        <p className="tc-mono" style={{ fontSize: 11, color: 'var(--tc-text-dim)', marginBottom: 14 }}>
          gameId 重复将覆盖。错误行被跳过并在下方列出。最大 5000 行。
        </p>

        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <input
            type="file"
            name="file"
            accept=".csv,.xlsx,.xls"
            required
            style={{
              flex: 1,
              background: 'var(--tc-bg-0)',
              color: 'var(--tc-text)',
              border: '1px dashed var(--tc-line2)',
              padding: '9px 12px',
              fontFamily: 'var(--tc-font-mono)',
              fontSize: 11,
            }}
          />
          <button type="submit" disabled={submitting} className="tc-btn tc-btn-primary">
            {submitting ? '▸ UPLOADING…' : '▸ START IMPORT'}
          </button>
        </form>

        <details style={{ marginTop: 14 }}>
          <summary className="tc-label" style={{ cursor: 'pointer' }}>▸ COLUMN SCHEMA</summary>
          <ul
            className="tc-mono"
            style={{ fontSize: 11, color: 'var(--tc-text-dim)', marginTop: 8, paddingLeft: 18, lineHeight: 1.7 }}
          >
            <li>required: <span style={{ color: 'var(--tc-cyan)' }}>gameId / nickname / primaryPositions / cost</span></li>
            <li>optional: <span style={{ color: 'var(--tc-amber)' }}>secondaryPositions / isCaptain / isRetired</span></li>
            <li>positions: <code>TOP / JUNGLE / MID / ADC / SUPPORT</code> 或 上单/打野/中单/射手/辅助，逗号分隔</li>
            <li>booleans: <code>true / false / 1 / 0 / 是 / 否</code></li>
          </ul>
        </details>
      </div>

      {result && (
        <div className="tc-card" style={{ padding: 18, position: 'relative' }}>
          <span className="corner tl" /><span className="corner tr" />
          <span className="corner bl" /><span className="corner br" />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="tc-h2">RESULT</div>
            {result.truncated && (
              <span
                className="tc-chip"
                style={{ background: 'rgba(255,178,61,0.14)', color: 'var(--tc-amber)', borderColor: 'var(--tc-amber)' }}
              >
                ⚠ TRUNCATED @ 5000 ROWS
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
            <Stat label="TOTAL" value={result.totalRows} accent="var(--tc-text)" />
            <Stat label="INSERT" value={result.inserted} accent="var(--tc-green)" />
            <Stat label="UPDATE" value={result.updated} accent="var(--tc-cyan)" />
            <Stat label="SKIPPED" value={result.skipped.length} accent="var(--tc-red)" />
          </div>

          {result.duplicates.length > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: 10,
                background: 'rgba(255,178,61,0.06)',
                borderLeft: '3px solid var(--tc-amber)',
              }}
            >
              <div className="tc-label" style={{ color: 'var(--tc-amber)' }}>IN-FILE DUPLICATES (LATER WINS)</div>
              <ul
                className="tc-mono"
                style={{ fontSize: 11, color: 'var(--tc-text)', marginTop: 6, paddingLeft: 18 }}
              >
                {result.duplicates.map((d) => (
                  <li key={d.gameId}>
                    <code style={{ color: 'var(--tc-amber)' }}>{d.gameId}</code> · rows {d.rows.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.skipped.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div className="tc-label" style={{ color: 'var(--tc-red)' }}>SKIPPED ROWS</div>
              <div style={{ marginTop: 6, border: '1px solid var(--tc-line2)' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 140px 1fr',
                    background: 'rgba(255,61,92,0.08)',
                    padding: '5px 10px',
                    borderBottom: '1px solid var(--tc-line2)',
                  }}
                >
                  {['ROW', 'GAME ID', 'ERRORS'].map((h) => (
                    <span key={h} className="tc-label" style={{ fontSize: 9 }}>{h}</span>
                  ))}
                </div>
                {result.skipped.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 140px 1fr',
                      padding: '6px 10px',
                      alignItems: 'center',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                      borderBottom: '1px dashed var(--tc-line)',
                      fontFamily: 'var(--tc-font-mono)',
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: 'var(--tc-text-faint)' }}>#{s.row}</span>
                    <span style={{ color: 'var(--tc-cyan)' }}>{s.gameId || '—'}</span>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {s.errors.map((err, j) => (
                        <span
                          key={j}
                          className="tc-chip"
                          style={{
                            background: 'rgba(255,61,92,0.14)',
                            color: 'var(--tc-red)',
                            borderColor: 'var(--tc-red)',
                          }}
                        >
                          {err}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="tc-mono" style={{ fontSize: 11, color: 'var(--tc-green)', marginTop: 12 }}>
              ✓ NO ERRORS
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ padding: '10px 12px', border: '1px solid var(--tc-line)', background: 'rgba(255,255,255,0.02)' }}>
      <div className="tc-label" style={{ fontSize: 9 }}>{label}</div>
      <div className="tc-num" style={{ fontSize: 26, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  );
}
