import { Separator } from 'lol-system';

export function Horizontal() {
  return (
    <div style={{ width: 280 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Tournament settings</div>
      <div style={{ fontSize: 13, color: '#6b7280' }}>Manage format and schedule</div>
      <Separator style={{ margin: '12px 0' }} />
      <div style={{ fontSize: 13, color: '#6b7280' }}>Single elimination · Bo3 finals</div>
    </div>
  );
}

export function Vertical() {
  return (
    <div style={{ display: 'flex', height: 24, alignItems: 'center', gap: 12, fontSize: 14 }}>
      <span>Profile</span>
      <Separator orientation="vertical" />
      <span>Matches</span>
      <Separator orientation="vertical" />
      <span>Stats</span>
    </div>
  );
}
