import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from 'lol-system';

export function Open() {
  return (
    <Select defaultOpen defaultValue="bo3">
      <SelectTrigger style={{ width: 220 }}>
        <SelectValue placeholder="Match format" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="bo1">Best of 1</SelectItem>
        <SelectItem value="bo3">Best of 3</SelectItem>
        <SelectItem value="bo5">Best of 5</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function Closed() {
  return (
    <Select defaultValue="bo3">
      <SelectTrigger style={{ width: 220 }}>
        <SelectValue placeholder="Match format" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="bo1">Best of 1</SelectItem>
        <SelectItem value="bo3">Best of 3</SelectItem>
        <SelectItem value="bo5">Best of 5</SelectItem>
      </SelectContent>
    </Select>
  );
}
