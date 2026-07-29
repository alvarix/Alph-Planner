# iCloud + File System Access API — Full History & Resolution

**Final conclusion (2026-07-28):** The 38 `NoModificationAllowedError` errors
were caused by a stale Service Worker serving old cached JS bundles. CloudKit
FileProvider denial is **not** the root cause — the app has worked with iCloud
files for 3 months. The SW clear + site data clear ritual fixes it every time.

## How the SW causes the error

1. User deploys new code to Vercel
2. User opens the PWA (or navigates to the URL)
3. The **old** Service Worker intercepts the request and serves **stale cached
   JS bundles** from the previous deploy
4. Those stale bundles reference or create FileSystemDirectoryHandle objects
   that Chrome's sandbox no longer recognizes as valid (handle format mismatch
   across deploys)
5. Every FSAA operation throws `NoModificationAllowedError`
6. The app shows "File temporarily locked or inaccessible" — technically true
   but completely misleading

The old SW stays in control even after `skipWaiting()` because:

- `skipWaiting()` activates the new SW but doesn't take over existing clients
- Without `clients.claim()`, existing tabs continue using the old SW
- The PWA (standalone window) is one long-lived client — it never naturally
  releases the old SW until the window is closed

## Why the workaround works (and always will)

Unregistering the SW + clearing site data removes the stale cache entirely.
The next load fetches everything fresh from the network. No stale code, no
handle mismatch, no errors. This is deterministic — no timing dependency.

## Timeline of attempts

| Date | Event | Result |
| ------ | ------- | -------- |
| 2026-06-09 | `applyDefaults` writes made non-fatal on lock | Mitigation, not fix |
| 2026-06-25 | Troubleshooting doc added: SW clear workaround | **Correct fix documented** |
| 2026-07-02 | `NoModificationAllowedError` → `locked` classification, retry logic | Addressed wrong cause (transient locks, not stale SW) |
| 2026-07-03 | Retries extended, probe added, handleFocus skip logic | Addressed wrong cause |
| 2026-07-19 | Re-prompt loop broken, bug doc written | Stopped symptom loop, still wrong cause |
| 2026-07-27 | `mode: "read"` + `ensureWritePermission` (uncommitted) | Addressed wrong cause; harmless but unnecessary |
| 2026-07-28 | Systematic diagnosis: isolate SW as root cause | **Confirmed: committed code + iCloud works after SW clear** |
| 2026-07-28 | This doc finalized | — |

## What was ruled out

| Theory | Evidence against |
| -------- | ----------------- |
| CloudKit FileProvider denial | App works with iCloud files after SW clear. Same directory, same files. |
| `brctl download` eviction fix | Files were never evicted — the problem was stale code, not missing data |
| `mode: "read"` bypassing write lock | Read-only open doesn't change anything — the lock was from stale code, not CloudKit |
| Timing-dependent (must wait X seconds) | SW clear is instant; the fix works immediately on next load |

## Code changes made (and kept)

### Kept (useful)

- **Retry logic** in `files.ts` — handles genuine transient iCloud sync locks
- **Break re-prompt loop** (`8a6047b`) — prevents infinite picker loop
- **Probe in `changeFolder()`** (`d98569e`) — prevents blank flash on broken handle
- **`completeTask`/delayed completion** feature — unrelated feature, extracted to clean branch

### Reverted (addressed wrong problem)

- `mode: "read"` open + `ensureWritePermission` escalation — doesn't fix the real cause
- `"transient-lock"` FolderErrorReason — defined but never returned
- `instanceof FsError` pass-through in `classifyError()` — was for the escalation path

### Added (non-recurrence)

- **"Clear cache & reload" button** in recovery UI — one-click unregister SW + clear caches + reload
- **Update banner** — "A new version is available. Refresh now" when SW detects new deploy
- **Diagnostic probe** (`src/lib/fs/diagnostics.ts`) — fires on every `icloud-locked` error. Independently tests SW state, IndexedDB handle, directory permissions, and folder path. Outputs a structured console report with ranked likely causes. Next time the error occurs, we'll know exactly which variable failed.
- Improved error messages that name stale cache as the likely cause

## Next time it breaks

Open the console — the diagnostic probe fires automatically when
`NoModificationAllowedError` occurs. It will show a group like:

```
🔍 Access Failure Diagnostic  2026-07-28T...
  Service Worker: controlling=true, updateWaiting=false
  IndexedDB: storeExists=true, handles=1
  Handle: rw=granted, read=granted
  Folder: name=Daily, likelyICloud=true
  Likely causes:
    → sw-active: SW active, no pending update — not the SW
    → handle-ok: Both permissions granted — not the handle
    → icloud-path: iCloud folder — possible CloudKit denial
```

This tells us exactly which fixes to try and which are ruled out.
