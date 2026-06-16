import { Button, LoadingButtonContent } from 'lol-system';

export function Default() {
  return <Button>Save changes</Button>;
}

export function Variants() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button disabled>Disabled</Button>
      <Button variant="outline" disabled>Disabled</Button>
    </div>
  );
}

export function Loading() {
  return (
    <Button disabled>
      <LoadingButtonContent loading loadingText="Saving…">Save changes</LoadingButtonContent>
    </Button>
  );
}
