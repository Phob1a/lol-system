import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Button,
} from 'lol-system';

export function Default() {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Team actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Manage team</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Edit roster</DropdownMenuItem>
        <DropdownMenuItem>View schedule</DropdownMenuItem>
        <DropdownMenuItem>Message captain</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Withdraw team</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
