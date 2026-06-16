import { Label, Input, Checkbox } from 'lol-system';

export function Default() {
  return <Label>Summoner name</Label>;
}

export function WithInput() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
      <Label htmlFor="team">Team name</Label>
      <Input id="team" placeholder="e.g. Cloud Nine" />
    </div>
  );
}

export function WithCheckbox() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="notify" defaultChecked />
      <Label htmlFor="notify">Email me match reminders</Label>
    </div>
  );
}
