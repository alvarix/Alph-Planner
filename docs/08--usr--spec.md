# 08 — FS Connection Bugs + Error Handling

## Session context

Reported bugs:
- App loses folder connection, especially on new week (browser reload / overnight)
- Backlog.md appears empty despite the file having content
- Task added in app disappears after browser refresh (but file was written)
- Task added directly in .md file does not appear after returning to tab

Proposed fix: button to reselect the md folder + hardened permission/refresh cycle + error logging layer.

---

## Tasks

### Core bug fixes

- [x] Add "Change folder" button to topbar — calls `pickFolder()` + `refresh()`
- [x] Add "Sync" (manual refresh) button to topbar — calls `refresh()` explicitly
- [x] Harden `handleFocus` in `+page.svelte` — re-run `restoreFolder()` on every focus, update `appState.folder`, only refresh if `ready`
- [x] Wrap `listDailyFiles` (`files.ts`) in try/catch — catch `NotAllowedError`, propagate a typed error upward instead of silently crashing
- [x] Catch permission failures in `refresh()` (`state.svelte.ts`) — if FSAA throws, set `appState.folder` to `needs-permission` so picker overlay auto-appears

### Error handling / logging layer

- [x] Add `appState.lastError` population for FSAA permission failures (currently only used for move/toggle failures)
- [x] Decide: structured console logging vs. in-app log panel — console.error chosen, no panel
- [x] Add `console.error` with structured context in all catch blocks that currently silently swallow errors (`refresh`, `listDailyFiles`, `readFile`, `writeFile`)
- [x] Add a visible error state to topbar when folder is `needs-permission` or `error` (currently only the overlay shows — not visible while using app)

### Testing

- [ ] Unit test: `refresh()` sets `appState.folder` to `needs-permission` when FSAA throws `NotAllowedError` — deferred (requires FSAA mock setup)
- [ ] Manual smoke test: reload page, verify "Re-grant access" flow works end-to-end
- [ ] Manual smoke test: edit .md file externally, switch back to app tab, verify task appears

---

## User feedback / iteration notes

_Leave blank — fill in after review_
