import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  Badge,
} from 'lol-system';

export function Standings() {
  const rows = [
    { team: 'Cloud Nine', w: 6, l: 2, status: 'Qualified', variant: 'default' as const },
    { team: 'Team Liquid', w: 5, l: 3, status: 'In contention', variant: 'secondary' as const },
    { team: 'TSM', w: 3, l: 5, status: 'Eliminated', variant: 'outline' as const },
    { team: '100 Thieves', w: 1, l: 7, status: 'Disqualified', variant: 'destructive' as const },
  ];
  return (
    <Table>
      <TableCaption>Group A standings — Summer Split</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Team</TableHead>
          <TableHead>W</TableHead>
          <TableHead>L</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.team}>
            <TableCell style={{ fontWeight: 500 }}>{r.team}</TableCell>
            <TableCell>{r.w}</TableCell>
            <TableCell>{r.l}</TableCell>
            <TableCell>
              <Badge variant={r.variant}>{r.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
