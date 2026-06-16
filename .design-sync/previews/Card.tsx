import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from 'lol-system';

export function Default() {
  return (
    <Card style={{ width: 360 }}>
      <CardHeader>
        <CardTitle>Team Registration</CardTitle>
        <CardDescription>Sign up your roster for the Summer Split.</CardDescription>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
          Five players plus an optional substitute. Registration closes when the
          group stage bracket is drawn.
        </p>
      </CardContent>
      <CardFooter style={{ gap: 8 }}>
        <Button>Register team</Button>
        <Button variant="outline">Learn more</Button>
      </CardFooter>
    </Card>
  );
}

export function WithStats() {
  return (
    <Card style={{ width: 320 }}>
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardTitle>Cloud Nine</CardTitle>
          <Badge variant="secondary">Group A</Badge>
        </div>
        <CardDescription>Seed #2 · 8 matches played</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>6</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Wins</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>2</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Losses</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
