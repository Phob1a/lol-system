import { Badge } from 'lol-system';

export function Default() {
  return <Badge>New</Badge>;
}

export function Variants() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  );
}

export function StatusTags() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Badge>Registered</Badge>
      <Badge variant="secondary">Captain</Badge>
      <Badge variant="outline">Substitute</Badge>
      <Badge variant="destructive">Disqualified</Badge>
    </div>
  );
}
