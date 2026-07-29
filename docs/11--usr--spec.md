# 11--usr--spec.md

## Info drawer + change log

Move lesser-used header controls into a right-side drawer. Add an in-session change history panel (git-log style).

## Tasks

- [x] Add `ChangeEntry` type to `lib/types.ts`
- [x] Add `changeLog[]` to `AppState` in `lib/state.svelte.ts`
- [x] Add `recordChange()` helper with 200-entry cap
- [x] Wire `recordChange()` into add, delete, rename, move, toggle, complete, subtask, and backlog complete mutations
- [x] Create `InfoDrawer.svelte` component with three tabs (Info, Options, History)
- [x] Info tab: explain all header buttons, list features, show file format sample
- [x] Options tab: move Upcoming, Colon, Sync, Change folder, vault setting into toggle switches and buttons
- [x] History tab: render change log as time-ordered grouped list with icon dots
- [x] Simplify header to: week nav, Done log, folder badge, conflict badge, "i" button
- [x] Remove unused vault CSS from +page.svelte
- [x] Type check passes, all 130 unit tests pass, build succeeds
- [x] Update changelog and readme

## Usr feedback

(inline)
