import { Checkbox, Label } from 'lol-system';

export function Default() {
  return <Checkbox defaultChecked />;
}

export function States() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <Checkbox /> Unchecked
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <Checkbox defaultChecked /> Checked
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, opacity: 0.6 }}>
        <Checkbox disabled /> Disabled
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, opacity: 0.6 }}>
        <Checkbox disabled defaultChecked /> Disabled checked
      </label>
    </div>
  );
}

export function WithLabel() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="rules" defaultChecked />
      <Label htmlFor="rules">I accept the tournament rules</Label>
    </div>
  );
}
