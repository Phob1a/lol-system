# Draft Drag Pick Design

Date: 2026-06-13
Status: approved

## Goal

During captain draft, make the primary pick interaction match the domain model: drag an available player card into one empty slot on the captain's own team, then confirm before submitting.

## Decisions

- Drag-to-pick is available only when the logged-in captain is on the clock.
- Only unpicked, affordable player cards are draggable.
- Only empty slots on the captain's own team are valid drop targets.
- Dropping a player opens the existing pick confirmation dialog with the dropped position preselected.
- No visible `PICK` button is shown on eligible cards; the interface should teach drag-to-slot as the primary path.
- Double-click/double-tap on an eligible player card remains a fallback and opens the same confirmation dialog without a preselected position.
- Confirmation still calls the existing `/api/draft/pick` route with `registrationId`, `position`, and `expectedSeq`.
- Existing post-draft/team-management slot rearrangement remains unchanged and continues to use `/api/draft/team/[id]/slots`.

## Non-Goals

- No change to draft ordering, budget, locking, or `expectedSeq` semantics.
- No direct-submit-on-drop mode.
- No admin manual-round rewrite.

## Testing

- Component test: opening `PickAction` with an initial position preselects that slot.
- Component test: draggable pool cards expose drag affordance only when enabled.
- Component test: double-click on a draggable player card requests the fallback pick action.
- Component test: own team empty slots expose drop affordance when pick dragging is enabled.
