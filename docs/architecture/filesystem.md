# File System Architecture

## Responsibilities

This layer is the app's only I/O path. It handles:
- Selecting and persisting the user's folder
- Reading and writing `.md` files
- Listing daily files for the week view
- Detecting iCloud conflict copies

There is no backend server. All data operations are local, synchronous from the user's perspective.

## Key Files

| File | Role |
|------|------|
| `lib/fs/folder.ts` | Folder picker, permission state machine |
| `lib/fs/files.ts` | File read/write, directory listing |
| `lib/fs/handle-store.ts` | IndexedDB persistence of `FileSystemDirectoryHandle` |

## Folder State Machine

`FolderState` has four values:

```
'none' ──pick()──► 'ready'
'ready' ──revoke──► 'needs-permission'
'needs-permission' ──requestPermission()──► 'ready'
'ready' / 'needs-permission' ──error──► 'error'
```

- **`none`**: No folder selected → show `FolderPicker` overlay
- **`ready`**: Handle stored and permission granted → app can read/write
- **`needs-permission`**: Handle in IndexedDB but permission revoked (e.g., after browser restart) → show re-grant button
- **`error`**: Unrecoverable → show error message

`pickFolder()` and `requestPermission()` both require a user gesture (browser security requirement).

## File Naming Conventions

| Pattern | Meaning |
|---------|---------|
| `YYYY-MM-DD.md` | Daily task file |
| `Backlog.md` | Floating tasks without a date |
| `Defaults.md` | Recurring task templates |
| `* (conflict copy).md` | iCloud sync conflict — surfaced in UI, not auto-resolved |

## Read/Write Operations

All operations use the File System Access API (`FileSystemDirectoryHandle`).

- **`readFile(dir, filename)`** — Returns file text or `null` if the file doesn't exist. Never throws on missing file.
- **`writeFile(dir, filename, content)`** — Creates or overwrites the file. Creates daily files on first task add.
- **`listDailyFiles(dir)`** — Returns all `.md` files matching `YYYY-MM-DD.md` plus `Backlog.md`, sorted by date.
- **`readDefaultsFile(dir)`** — Reads `Defaults.md`; returns `null` if absent.
- **`detectConflicts(dir)`** — Returns filenames matching the iCloud conflict pattern.

## Handle Persistence (IndexedDB)

The `FileSystemDirectoryHandle` is stored in IndexedDB via `lib/fs/handle-store.ts`. On app load, `restoreFolder()` attempts to reload it silently. If the stored handle's permission has lapsed, the state transitions to `needs-permission` and the user must click to re-grant.

This is the only use of IndexedDB in the app.

## Constraints

- File System Access API is **Chromium-only** — Safari and Firefox do not support it
- Permission re-grant requires a user gesture — cannot be done silently on load
- The app cannot watch for file changes — sync is pull-based (triggered by `window.focus`)
- iCloud may create conflict copies when the folder is synced — these are detected and shown, but resolution is left to the user

## Known Issues

- No retry logic on transient write failures — if a write fails mid-operation, the cache may be stale until the next `refresh()`
- No file locking — concurrent writes from Obsidian + this app at the exact same moment could cause data loss (extremely rare in practice)
