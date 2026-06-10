# 08 — Status

## Completed: 2026-06-08

All tasks from `08--usr--spec.md` implemented in one pass.

### What was done

**`src/lib/fs/files.ts`**
- Added `FsError` class with `reason: 'not-found' | 'permission' | 'io'`
- Added `classifyError()` helper that maps raw FSAA errors to typed `FsError`
- `readFile`: now returns `null` only for `NotFoundError`; throws `FsError('permission')` on `NotAllowedError`/`SecurityError` — callers can tell apart a missing file from a revoked permission
- `writeFile`: wrapped in try/catch, throws typed `FsError`, logs `console.error`
- `listDailyFiles`: wrapped in try/catch, throws typed `FsError`, logs `console.error`
- `detectConflicts`: wrapped in try/catch, logs `console.warn`, returns `[]` on failure (non-fatal)

**`src/lib/state.svelte.ts`**
- Imported `FsError`
- `refresh()`: added catch block — `FsError('permission')` sets `appState.folder` to `needs-permission` (triggers picker overlay automatically); other errors call `fail()` and `console.error`
- `toggleTask`, `toggleChild`, `deleteTask`: added `console.error` to existing catch blocks
- `moveTask` rollback path: added `console.error` with structured context (`task.title`, `targetFilename`)

**`src/routes/+page.svelte`**
- Added `pickFolder` import
- Added `isRefreshing: $state(false)` guard
- `handleFocus`: made async, re-runs `restoreFolder()` on every focus to detect mid-session permission loss, guarded by `isRefreshing`
- Added `manualRefresh()`: explicit disk re-read, guarded by `isRefreshing`, Sync button disabled while in-flight
- Added `changeFolder()`: opens native folder picker, always available
- Topbar: added Sync button (disabled while refreshing), Change folder button (always), Reconnect folder button (crimson, only when `needs-permission`)
- CSS: `.btn-nav.warn` (crimson border/text, white on hover), `.btn-nav:disabled` (opacity 0.45)

### Decisions made (from open questions)

1. "Change folder" always visible — doubles as first-time setup path if overlay is dismissed
2. `isRefreshing` guard added — prevents concurrent `refresh()` calls on rapid tab-switching
3. `readFile` now distinguishes not-found (null) from permission denied (throws) — callers in `refresh()` catch it and trigger the picker; other callers (addTask, toggleTask, etc.) let it propagate up to the catch blocks already in those functions

### No-log-panel decision

Structured `console.error` with context objects added to all silent catch blocks. No in-app log panel — browser DevTools is sufficient for a solo-user app. Revisit if iCloud sync debugging becomes a need.

### Tests

- `pnpm check`: 0 errors, 10 pre-existing warnings (a11y + non-reactive bindings, unrelated to this work)
- `pnpm test:unit`: 86/86 passing

### Suggested commit

```
fix(fs): harden permission recovery and add folder reconnect button

- re-check folder permission on every window focus via restoreFolder()
- add isRefreshing guard to prevent concurrent refresh calls
- catch NotAllowedError in readFile/writeFile/listDailyFiles, propagate as FsError
- catch FsError(permission) in refresh(), auto-surface needs-permission state
- add Change folder and Sync buttons to topbar (always visible)
- add Reconnect folder badge when folder is in needs-permission state
- add console.error with structured context to all silent catch blocks
```
