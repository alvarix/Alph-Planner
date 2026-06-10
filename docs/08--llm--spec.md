# 08 — FS Connection Bugs + Error Handling: Implementation Spec

## Problem summary

All three reported bugs share the same root cause: the File System Access API revokes `readwrite` permission after a page reload (and sometimes mid-session after OS sleep/wake). When that happens:

1. `restoreFolder()` returns `{ status: 'needs-permission' }`
2. `appState.folder.status !== 'ready'`
3. `dir()` returns `null`
4. `refresh()` silently returns on its first line — **cache is never populated**
5. All columns and Backlog show as empty

The FolderPicker overlay renders on top of the empty app, but:
- There is no visible indicator in the topbar that the connection is lost
- The overlay can be dismissed (or user ignores it thinking it's a loading state)
- If permission lapses mid-session, `handleFocus` sees `folderReady() === true` (stale state), calls `refresh()`, but `listDailyFiles` throws — this throw is uncaught inside `refresh()`'s try/finally (only resets `loading`), leaving the cache stale with no user-visible error

---

## Fix 1 — Harden `handleFocus`

**File**: `src/routes/+page.svelte`

Current:
```ts
function handleFocus() {
    if (folderReady()) refresh();
}
```

Problem: stale `appState.folder.status === 'ready'` is trusted. If permission was revoked mid-session, this calls `refresh()` which then throws silently.

Fix: re-check permission on every focus.

```ts
async function handleFocus() {
    const state = await restoreFolder();
    appState.folder = state;
    if (state.status === 'ready') await refresh();
}
```

This ensures the folder state is always current when the window regains focus. Because `restoreFolder()` calls `queryPermission()` (not `requestPermission()`), it does not require a user gesture — safe to call here.

---

## Fix 2 — Wrap `listDailyFiles` in try/catch

**File**: `src/lib/fs/files.ts`

Current `listDailyFiles` has no error handling. If `dir.entries()` throws `NotAllowedError` (permission revoked), the error propagates through `refresh()` uncaught.

Fix:

```ts
export async function listDailyFiles(dir: FileSystemDirectoryHandle): Promise<string[]> {
    const names: string[] = [];
    try {
        for await (const [name] of dir.entries()) {
            if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name) || name === 'Backlog.md') {
                names.push(name);
            }
        }
    } catch (err: any) {
        // Re-throw as a typed error so callers can distinguish permission failures
        // from genuine I/O errors.
        const isPermission = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        throw Object.assign(new Error(isPermission ? 'fs-permission' : 'fs-error'), { cause: err });
    }
    return names.sort();
}
```

---

## Fix 3 — Catch permission failures in `refresh()`

**File**: `src/lib/state.svelte.ts`

Add a catch block to the existing try/finally in `refresh()`:

```ts
export async function refresh(): Promise<void> {
    const d = dir();
    if (!d) return;

    appState.loading = true;
    try {
        // ... existing body ...
    } catch (err: any) {
        if (err?.message === 'fs-permission') {
            // Permission was revoked mid-session — surface the picker.
            if (appState.folder.status === 'ready') {
                appState.folder = {
                    status: 'needs-permission',
                    handle: appState.folder.handle,
                    name:   appState.folder.name,
                };
            }
        } else {
            fail(`Refresh failed: ${err?.message ?? 'unknown error'}`);
        }
        console.error('[refresh]', err);
    } finally {
        appState.loading = false;
    }
}
```

---

## Fix 4 — Add "Change folder" + "Sync" buttons to topbar

**File**: `src/routes/+page.svelte`

Two buttons, placed after the folder-badge in the topbar.

```svelte
<!-- after .folder-badge -->
<button class="btn-nav" onclick={manualRefresh} title="Re-read files from disk">Sync</button>
<button class="btn-nav" onclick={changeFolder}>Change folder</button>
```

```ts
async function manualRefresh() {
    await refresh();
}

async function changeFolder() {
    const result = await pickFolder();
    appState.folder = result;
    if (result.status === 'ready') await refresh();
}
```

Import addition needed at top of `<script>`:
```ts
import { restoreFolder, pickFolder } from '$lib/fs/folder.js';
```

(`restoreFolder` is already imported; add `pickFolder`.)

---

## Fix 5 — Topbar connection status indicator

When `appState.folder.status === 'needs-permission'` or `'error'`, the only visual feedback is the full-screen overlay. If the user is already looking at data and focus triggers a permission check that fails, they see nothing in the topbar.

Add a small warning badge next to the folder name badge:

```svelte
{#if appState.folder.status === 'needs-permission'}
    <button class="btn-nav warn" onclick={changeFolder}>Reconnect folder</button>
{/if}
{#if appState.folder.status === 'error'}
    <span class="conflict-badge">FS error</span>
{/if}
```

This gives the user a direct action even if they dismiss the overlay.

---

## Error handling / logging assessment

### Current state

All catch blocks in `state.svelte.ts` call `fail(msg)` which sets `appState.lastError`, which is picked up by a `$effect` in `+page.svelte` and shown as a toast. This covers toggle/move/write failures but NOT:
- `refresh()` failures (no catch, only finally)
- `listDailyFiles` throws (propagates uncaught)
- `readFile` failures (returns `null` silently — appropriate for "file not found" but masks permission errors)

### Recommendation: structured console logging, not a log panel

**Decision: no in-app log panel for now.**

Rationale:
- The user base is one (solo app). The browser DevTools console is the right surface for debugging.
- An in-app log panel adds UI complexity and a component that needs its own state.
- The toasts + topbar warning badge cover actionable errors for the user.
- A log panel makes more sense when there are multiple concurrent users reporting issues.

**What to add immediately (low effort, high debug value):**

Add `console.error` with structured context in every catch block that currently swallows errors silently. Pattern:

```ts
catch (err: any) {
    console.error('[moduleName:functionName]', { err, context: { filename, ... } });
    fail('User-visible message');
}
```

Specific locations:
- `refresh()` — add catch (Fix 3 above)
- `listDailyFiles` — Fix 2 above
- `readFile` / `writeFile` in `files.ts` — currently return null / throw silently; add `console.warn` at minimum
- `toggleTask`, `addSubtask`, `toggleChild` — already call `fail()` but don't log
- `moveTask` rollback path — logs nothing on failure

**Future: if multi-device or iCloud sync debugging becomes needed**, a lightweight in-app log (ring buffer of last 50 events, shown in a collapsible drawer) would be worthwhile. Spec that separately.

### Summary table

| Location | Current | Proposed |
|---|---|---|
| `refresh()` | silent (only finally) | catch → set needs-permission or fail() + console.error |
| `listDailyFiles` | uncaught throw | typed re-throw + console.error |
| `readFile` | returns null | add console.warn for non-NotFound errors |
| `writeFile` | throws raw | add console.error wrapper |
| `toggleTask` / `toggleChild` | fail() only | add console.error |
| `moveTask` rollback | fail() only | add console.error |
| topbar | folder name badge only | add Reconnect button on needs-permission |

---

## Files to change

| File | Change |
|---|---|
| `src/routes/+page.svelte` | harden `handleFocus`, add `changeFolder` + `manualRefresh`, add `pickFolder` import, add topbar buttons + reconnect badge |
| `src/lib/fs/files.ts` | wrap `listDailyFiles` in try/catch with typed error |
| `src/lib/state.svelte.ts` | add catch to `refresh()`, add console.error to existing catch blocks |

---

## Commit strategy

Single commit, all four fixes together — they are tightly coupled (the button is the user escape hatch; the permission detection is the automatic recovery; the error propagation connects them). Split would leave intermediate states broken.

```
fix(fs): harden permission recovery and add folder reconnect button

- re-check folder permission on every window focus via restoreFolder()
- catch NotAllowedError in listDailyFiles, propagate as typed error
- catch permission failures in refresh(), set folder to needs-permission
- add Change folder and Sync buttons to topbar
- add Reconnect badge when folder is in needs-permission state
- add console.error with structured context in all silent catch blocks
```

---

## Open questions for Alvar

1. Should "Sync" and "Change folder" buttons be visible at all times, or only when the folder is connected (i.e., hide "Change folder" when status is 'none' since FolderPicker handles that)?
2. Should `handleFocus` be debounced? Rapid tab-switching could trigger multiple concurrent `refresh()` calls (low risk since `appState.loading` is a flag, but worth discussing).
3. Do you want `readFile` to distinguish "file not found" from "permission denied" — currently both return `null`. For the Backlog specifically, a missing file vs. a permission error have different implications.
