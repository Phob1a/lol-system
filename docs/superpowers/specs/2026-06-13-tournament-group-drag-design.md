# Tournament Group Drag Design

Date: 2026-06-13
Status: approved

## Goal

Replace the setup-stage group assignment dropdowns with a card drag interface. The UI should match the task: move teams into group slots directly, then save or confirm with the existing backend contract.

## Decisions

- Drag assignment is available only while the tournament is in `SETUP`.
- The editable view has two regions:
  - an unassigned team pool;
  - fixed group columns with `teamsPerGroup` slots per group.
- Team cards can be dragged from the pool into an empty group slot.
- Team cards can be dragged between group slots.
- Dropping a grouped team onto an occupied group slot swaps the two grouped teams.
- Dropping a pool team onto an occupied group slot places the pool team there and returns the previous occupant to the pool.
- Dropping a grouped team back into the pool clears that slot.
- Visible dropdown assignment controls are removed from the editable view, so drag is the single primary interaction.
- `随机分组`, `保存分组`, and `确认分组并生成对阵` remain.
- `保存分组` and `确认分组并生成对阵` continue to call the existing `/api/tournament/admin/groups` route with the same `assignments: { groupId, teamIds[] }[]` payload.
- The locked view for non-`SETUP` statuses remains read-only.

## Data Flow

- Local state remains `string[][]`, indexed by group and slot.
- The pool is derived from teams not present in `assignments`.
- Drag payloads distinguish pool cards, group-slot cards, group slots, and the pool drop zone.
- On drop:
  - pool card to empty slot: write the team id into that slot;
  - pool card to occupied slot: move the dragged team into that slot and return the occupied team to the pool;
  - grouped card to empty slot: move it and clear the original slot;
  - grouped card to occupied slot: swap source and target slots;
  - grouped card to pool: clear the original slot.
- Payload construction filters blank slots exactly as today.

## Error Handling

- Client drag rules should prevent duplicate team ids in local state.
- Server validation remains the source of truth for missing teams, duplicate teams, wrong group ids, and wrong status.
- Save and confirm toasts keep the existing success and failure behavior.

## Non-Goals

- No backend schema or API change.
- No change to group count, group size, snapshot rebuild, or match generation.
- No auto-save on drag.
- No editable drag UI after groups are confirmed.

## Testing

- Component test: unassigned teams render in the pool and group slots render fixed capacity.
- Component test: dragging a pool team to an empty slot assigns it.
- Component test: dropping onto an occupied slot swaps teams.
- Component test: dragging a grouped team back to the pool clears its slot.
- Component test: save payload preserves the existing `assignments` shape.
