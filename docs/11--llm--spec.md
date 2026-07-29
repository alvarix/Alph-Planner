# 11--llm--spec.md

## Design

### Change log

In-memory `ChangeEntry[]` on `AppState` capped at 200 entries. A `recordChange(icon, action, file, detail)` helper prepends entries and prunes oldest. Wired into 10 mutation functions at the point where the write succeeds:

- `addTask` / `addTaskWithCategory` — `+` Added
- `deleteTask` — `−` Deleted
- `editTaskTitle` — `✎` Renamed (only if title actually changed)
- `moveTask` — `→` Moved (records target file + source)
- `toggleTask` (non-delayed path) — `−` Started / `○` Reopened
- `flushCompletion` — `✓` Completed
- `addSubtask` — `+` Added subtask
- `toggleChild` (3 paths) — parent cascade + child toggle
- `completeBacklogTask` — `✓` Completed (with "← Backlog" detail)

### InfoDrawer

Right-side fixed drawer (340px, z-index 60) with `fly` transition (x: 320). Three tabs:

**Info**: Static documentation covering header buttons, features, file format sample. Uses `<dl>` for structured button/feature descriptions.

**Options**: Toggle switches for hidePast and colonCatEnabled. Buttons for Sync and Change folder (shows current folder name). Vault name input managed internally with auto-focus via `$effect`. Conflict warning section appears when conflicts exist.

**History**: Groups entries by date label (Today / Yesterday / date). Each entry renders icon dot, time, action verb, detail (truncated), and filename (monospace). Empty state shows "No changes recorded yet."

### Header simplification

Removed from header: Upcoming, Colon, Sync, Change folder, Reconnect folder, vault badge/input. Kept: week nav, Done log, folder badge, conflict badge. Added "i" button to toggle drawer. Removed `.vault-badge`, `.vault-input`, `.btn-nav.warn` CSS.

### Vault input refactor

Moved vault input element ref from +page.svelte into InfoDrawer (local `$state`). The auto-focus `$effect` now lives in InfoDrawer alongside the input element. Parent passes only the value and callbacks.
