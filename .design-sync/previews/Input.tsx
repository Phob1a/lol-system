import { Input, Label } from 'lol-system';

export function Default() {
  return <Input placeholder="Summoner name" style={{ width: 280 }} />;
}

export function WithLabel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </div>
  );
}

export function States() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
      <Input placeholder="Empty" />
      <Input defaultValue="Faker" />
      <Input placeholder="Disabled" disabled />
    </div>
  );
}
