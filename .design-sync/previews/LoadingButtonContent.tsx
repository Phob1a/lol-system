import { Button, LoadingButtonContent } from 'lol-system';

export function Loading() {
  return (
    <Button disabled>
      <LoadingButtonContent loading loadingText="Saving…">
        Save changes
      </LoadingButtonContent>
    </Button>
  );
}

export function Idle() {
  return (
    <Button>
      <LoadingButtonContent loading={false}>Save changes</LoadingButtonContent>
    </Button>
  );
}

export function CustomLoadingText() {
  return (
    <Button variant="destructive" disabled>
      <LoadingButtonContent loading loadingText="Disqualifying…">
        Disqualify team
      </LoadingButtonContent>
    </Button>
  );
}
