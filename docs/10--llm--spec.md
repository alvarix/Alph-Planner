# 10 — Folder re-prompt loop: fix spec

## Problem classification

**Category:** File System Access API error handling / state management with UX recovery loops.

The app does not distinguish between four distinct failure modes of `NoModificationAllowedError`:

| Failure mode | Correct response |
| --- | --- |
| Permission genuinely revoked | Transition to `needs-permission`, prompt re-grant |
| iCloud Drive (permanent incompatibility) | Tell user to move files, offer "forget folder" |
| Stale PWA handle (redeploy) | Clear handle, re-pick folder |
| Transient iCloud lock (sync in progress) | Retry with backoff, keep `ready` state |

Prior behavior treated all of them identically — transition to `needs-permission` — which created the infinite re-prompt loop.

## Architecture

**Pattern:** State Machine with Recovery Actions. The `FolderState` type now carries an `errorReason` discriminant that the FolderPicker UI maps to specific recovery guidance and action buttons.

**Data structures:** O(1) state transitions. Added `refreshFailCount` (number, resets on success) and `lastRefreshError` (`FolderErrorReason | null`) to `AppState`.

## Changes

### 1. `src/lib/fs/folder.ts` — `FolderErrorReason` type

Added `FolderErrorReason` union type: `permission-denied | icloud-locked | stale-handle | transient-lock | unknown`. Both `needs-permission` and `error` states now carry an optional `errorReason`.

### 2. `src/lib/fs/files.ts` — read retry + error classification

- `readFile()` now retries `locked` errors twice with 800ms delay (matching `writeFile` retry behavior). Previously it threw immediately on any non-`not-found` error.
- Added `classifyFolderError(err)` — maps raw FSAA errors to `FolderErrorReason` for the recovery UI.

### 3. `src/lib/state.svelte.ts` — break the loop

- **Retry counting:** `refreshFailCount` increments on each failed refresh, resets to 0 on success. Only transitions to `needs-permission` after 3 consecutive failures (for `locked`/`io` errors — `permission` errors still transition immediately).
- **Permission vs. locked distinction:** `permission` errors still prompt re-grant. `locked`/`io` errors keep the folder in `ready` state and show an error toast with recovery hints — the user can wait and retry with the Sync button.
- **`forgetAndResetFolder()`:** New exported action clears the IndexedDB handle, wipes the in-memory cache, and resets to `none` state. The FolderPicker's "Forget folder" button calls this.
- **iCloud hint in toast:** When `errorReason` is `icloud-locked`, the error toast includes the instruction to move files off iCloud Drive.

### 4. `src/lib/components/FolderPicker.svelte` — recovery UI

- **Busy guard** on all async operations — prevents double-clicks during folder operations.
- **Recovery hint:** Context-sensitive message based on `errorReason` — tells iCloud users to move files, stale-handle users to forget, etc.
- **Three actions when stuck:**
  - "Re-grant access" (primary) — re-requests permission and retries refresh.
  - "Retry" (secondary) — same as re-grant but resets the fail counter first.
  - "Forget folder & start fresh" (danger) — clears the handle entirely.

### 5. `src/routes/+page.svelte` — import `forgetAndResetFolder`

Exported for use in topbar actions (future: a "Reset all" button).

### 6. `docs/bugs/01--folder-reprompt-loop.md` — comprehensive bug doc

Documents all four failure modes, the loop trace, detection checklist, and five manual fix procedures.

### 7. `README.md` — troubleshooting section expanded

Added "Folder picker keeps re-prompting" section with five ordered fixes from in-app to manual Chrome operations.

### 8. `src/lib/fs/files.test.ts` — 10 new unit tests

- 3 tests for `readFile` retry behavior (retry success, retry exhaustion, no retry on non-locked).
- 7 tests for `classifyFolderError` covering all error names and edge cases.

## Why this honors the Step-Back Analysis

The fix uses a **state machine with recovery actions** pattern to map each FSAA failure mode to the correct user-facing recovery path, breaking the infinite loop by keeping `ready` state for transient errors while surfacing the `errorReason` discriminant so the UI can show context-specific guidance. All state transitions are O(1) and the retry counter provides backpressure against rapid failure cycling, which was the root cause of the re-prompt loop.
