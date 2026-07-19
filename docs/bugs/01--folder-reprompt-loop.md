# Bug 01 — Folder re-prompt loop

**Status:** Open  
**Severity:** High — user cannot use the app without manual intervention  
**First reported:** 2026-07-19

## Symptom

The folder picker overlay keeps showing after selecting a folder or clicking "Re-grant access." The user is trapped in a loop: pick folder → app tries to read/write → fails → shows picker again.

Console error:

```
[refresh] FsError: File temporarily locked or inaccessible
Caused by: NoModificationAllowedError: An attempt was made to write to a file
or directory which could not be modified due to the state of the underlying filesystem.
```

## Root cause

Chrome's File System Access API (FSAA) throws `NoModificationAllowedError` in three distinct situations:

| Situation | Detection | Recovery |
| --- | --- | --- |
| **iCloud Drive folder** | Any write (or even probe create) fails permanently | Move files to a local folder |
| **Transient iCloud lock** | Write fails during active sync; retry succeeds | Wait 1-2 seconds, retry |
| **Stale PWA handle** | Handle stored in IndexedDB is from a prior deploy or browser restart | Clear handle, re-pick folder |
| **Permission genuinely revoked** | `queryPermission()` returns `prompt` or `denied` | Re-grant via native dialog |

The app does not distinguish between these causes. Any `NoModificationAllowedError` during `refresh()` transitions the folder state to `needs-permission`, which triggers the `FolderPicker` overlay. The user clicks to reconnect, `refresh()` fails again, and the loop continues infinitely.

### The re-prompt loop trace

```
1. refresh() → listDailyFiles() or readFile() throws NoModificationAllowedError
2. classifyError() → FsError("locked", "...")
3. refresh() catch block:
   → appState.folder = { status: "needs-permission", ... }
4. +page.svelte: {#if !folderReady()} → shows <FolderPicker />
5. FolderPicker.svelte: "Re-grant access" button → grant() → requestPermission()
6. Permission granted → refresh()
7. refresh() fails again → goto 2.  ← INFINITE LOOP
```

The `changeFolder()` path in `+page.svelte` has a similar loop:

```
1. pickFolder() succeeds (user selects folder)
2. Probe: getFileHandle(probeName, {create:true}) → throws NoModificationAllowedError
3. probeOk = false → forgetFolder() → appState.folder = { status: "needs-permission" }
4. User clicks "Reconnect folder" → changeFolder() again
5. goto 1.  ← INFINITE LOOP
```

## Why the existing retry logic isn't enough

`writeFile()` in `files.ts` already retries `locked` errors twice with 800ms delay. This handles transient iCloud sync locks, but:

- `listDailyFiles()` also retries but only once with 500ms delay
- `readFile()` has **no retry logic** for `locked` errors — only `not-found` returns null
- The probe in `changeFolder()` has **no retry logic** at all — it fails on the first attempt
- Most importantly: once any of these fail and transition the state to `needs-permission`, the refresh cycle stops entirely (`handleFocus()` skips refresh when `needs-permission`)

## Manual fixes (when you're stuck in the loop)

### Fix 1: Clear the stored folder handle (fastest)

1. Open DevTools (F12)
2. Application → IndexedDB → `alph-planner-fs` → `handles` → right-click → **Clear**
3. Reload the page (Cmd+R)
4. Re-pick your folder

### Fix 2: Clear all site data

1. DevTools → Application → **Storage → Clear site data**
2. Reload the page
3. Re-pick your folder

### Fix 3: Unregister the service worker (if using PWA)

1. DevTools → Application → **Service Workers → Unregister**
2. Then do Fix 2
3. Reload and re-pick

### Fix 4: Move files off iCloud Drive (if applicable)

If your daily `.md` files live in an iCloud Drive folder (e.g., `~/Library/Mobile Documents/...`), Chrome's FSAA **does not support writes** to iCloud-synced directories. You must move your files to a local folder:

```sh
# Example: move from iCloud to a local folder
mkdir -p ~/Documents/alph-planner-data
cp ~/Library/Mobile\ Documents/com~apple~CloudDocs/alph-planner/*.md ~/Documents/alph-planner-data/
```

Then re-pick `~/Documents/alph-planner-data` in the app.

### Fix 5: Restart Chrome

Rarely, Chrome's FSAA implementation enters a broken internal state. A full Chrome restart (Cmd+Q, reopen) can clear it.

## Detection checklist for developers

When `NoModificationAllowedError` fires, check:

1. Is the folder on iCloud Drive? → Permanent. User must move files.
2. Did the error appear immediately after a deploy? → Probably stale SW. Unregister SW.
3. Does `queryPermission()` return `granted` but writes still fail? → Handle is stale. Clear IndexedDB.
4. Does the error only happen sometimes? → Transient iCloud lock. Add retry.
5. Did the error start after a macOS update? → Chrome may need restart.

## Affected code

| File | Role |
| --- | --- |
| `src/lib/fs/files.ts` | Error classification, retry logic |
| `src/lib/fs/folder.ts` | Folder state machine, probe logic |
| `src/lib/state.svelte.ts` | `refresh()` catch block transitions to `needs-permission` |
| `src/routes/+page.svelte` | `changeFolder()` probe, `handleFocus()` skip logic |
| `src/lib/components/FolderPicker.svelte` | UI for folder selection and re-grant |

## References

- [Chromium FSAA spec: NoModificationAllowedError](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission#exceptions)
- [Chrome bug tracker: iCloud Drive + FSAA](https://issues.chromium.org/issues/40285163)
