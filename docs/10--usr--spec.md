# 10 — Folder re-prompt loop bug

## Problem

When the File System Access API throws `NoModificationAllowedError` (iCloud lock, stale PWA handle), the app enters an infinite re-prompt loop:

1. `refresh()` fails → transitions folder state to `needs-permission`
2. FolderPicker overlay appears
3. User clicks "Re-grant access" or "Choose folder"
4. Permission is re-granted (or folder re-picked), `refresh()` is called again
5. `refresh()` fails with the same error → back to step 1

The user has no way to break out of this loop without manually clearing site data or deregistering the service worker.

## Tasks

- [ ] Create comprehensive bug documentation in `docs/bugs/01--folder-reprompt-loop.md`
- [ ] Add `errorReason` field to `FolderState` to classify WHY the last operation failed
- [ ] Add recovery action buttons to `FolderPicker.svelte`:
  - [ ] "Forget folder & clear handle" — calls `forgetFolder()`, resets to `none` state
  - [ ] "Try anyway (skip probe)" — skips the temp-file probe and proceeds with just the handle
  - [ ] "I moved my files to a local folder" — guide for iCloud users
- [ ] Break the re-prompt loop: don't auto-refresh after re-grant if the prior failure was `locked` (not `permission`)
- [ ] Add a retry-with-backoff counter to `refresh()` — if refresh has failed N times in a row for the same reason, stop trying and surface a persistent error instead of toggling state
- [ ] Add manual fix steps to README.md troubleshooting section (clear handle, clear site data, unregister SW)
- [ ] Write unit tests for the new error classification and state transitions
- [ ] Run `pnpm check` and `pnpm test:unit`

## Iteration

_None yet_
