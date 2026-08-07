# Changelog

## Unreleased

### Added

- **Duplicate task button.** A "dup" button appears on hover next to the star button on
  each task row. Duplicates the task (parent + children) with all checkboxes reset to
  `[ ]`, inserting the copy immediately after the original.
- **Colon shortcut in backlog add input.** The `Category: task` shorthand now works in
  the BacklogRail input, same as in day column inputs. Creates the category H1 header
  if it doesn't already exist in `Backlog.md`.

### Fixed

- **Overdue tasks no longer mirror into the backlog rail while their day column is visible.**
  Derived overdue rows are now filtered by the visible daily filenames, so one Markdown
  task has only one representation in the active view. If a past day is hidden with
  `Upcoming`, or is outside the selected week, its unfinished tasks still surface under
  `Overdue`.
- **Vault name input now reactive on every keystroke.** Switched from `onkeydown` to
  `oninput` so the vault name reflects live typing, not just on Enter/Blur.
- **Long-press checkbox race condition.** When long-pressing a task to complete it, the
  native checkbox `onclick` no longer fights Svelte's binding (moved guard from
  `onchange` to `onclick` + `preventDefault`).
- **Pending completion undo writes correct state.** Clicking the checkbox during the
  3-second undo window now force-writes `[ ]` instead of cycling through the tri-state,
  matching the actual disk state while the timer hasn't flushed.
- **Defaults now apply on week navigation and new file creation.** Navigating to a
  future week with the arrow buttons now triggers a refresh and creates missing day
  files for the visible week on the fly. Weekly and Monthly defaults from
  `Defaults.md` are baked into each new file immediately — no need to add a task
  first to trigger creation. Only one day per week receives the weekly defaults
  (the first file processed), matching the existing idempotency design.

### Changed

- **Past days visually recessed.** Past day columns now have a darker background (`#e0e0e0`),
  dimmed headers (50% opacity), darker dot-grid (`#d4d4d4`), and muted task cards
  (`#eaeaea`). Done tasks in past days fade to 35% opacity instead of 55%.
  Past days remain fully interactive but are clearly "archived" not active workspace.
- **Backlog rail darkened.** Background (`#e8e8e8`), task list (`#dcdcdc`), task cards
  (`#eee`), and duration badges all shifted darker to visually distinguish from active
  day columns.

### Fixed

- **Long-press on backlog tasks now moves to today.** Previously, long-pressing a `todo`
  backlog task marked it `[x]` in-place in `Backlog.md` instead of moving to today's
  file. Now any backlog task completed via long-press is moved to today as a done task.
- **Checkbox click on done backlog tasks handled correctly.** Added explicit handler for
  clicking a `done` backlog task — un-completes it in-place (todo) rather than falling
  through to the generic toggle path.
- **Clear cache & reload button.** Added to the InfoDrawer Options tab. Deregisters all
  service workers, clears caches, IndexedDB, and localStorage, then reloads. Use after
  deploys when the app appears stale.

### Added

- **Info drawer.** Right-side slide-in panel ("i" button in header) with three tabs:
  - **Info** — explains every header button, lists all features, shows Markdown file format sample
  - **Options** — houses Upcoming toggle, Colon shortcut toggle, Sync, Change folder, vault name setting, and conflict warnings (moved out of the header to reduce clutter)
  - **History** — in-session change log showing every mutation as a timestamped entry (adds, deletes, renames, moves, completions, subtask changes). Capped at 200 entries; resets on page reload.
- **`recordChange()`** in `lib/state.svelte.ts` — wired into all 10 write-path mutations so the History tab stays in sync automatically.

### Changed

- **Header simplified.** Upcoming, Colon, Sync, Change folder, Reconnect folder, and vault controls moved into the Info drawer. Header now contains only: week nav, week label, Done log, folder badge, conflict badge, and the "i" drawer toggle.

### Fixed

- **Stale Service Worker identified as root cause of `NoModificationAllowedError`.**
  After a deploy, the PWA's cached service worker served old JS bundles that could not
  talk to the filesystem. This was misdiagnosed as iCloud/CloudKit FileProvider denial
  for weeks. The app has worked with iCloud files the entire time — the error only
  appeared when the SW cache was stale. See `docs/icloud-fsaa-postmortem.md`.

### Added

- **Diagnostic probe** (`src/lib/fs/diagnostics.ts`). Fires automatically on every
  `NoModificationAllowedError`. Independently tests Service Worker state, IndexedDB
  handle, directory permissions, and folder path. Outputs a structured console report
  with ranked likely causes — next time the error occurs, the root cause is
  immediately identifiable.
- **"Clear cache & reload" button** in the FolderPicker recovery overlay. One click
  unregisters the service worker, clears all caches and IndexedDB, and reloads the page.
  No more DevTools ritual.
- **Update banner** in the layout. When a new app version is detected, a banner appears
  at the top of the page: "A new version is available. Refresh now."
- **Improved error messages.** Recovery hints now name stale cache as the likely cause
  instead of telling users to move files off iCloud.

### Removed

- **`mode: "read"` folder open + `ensureWritePermission` escalation.** Reverted — this
  was an attempted fix for the CloudKit denial theory and added complexity for no benefit.
- **`"transient-lock"` FolderErrorReason.** Defined but never returned by any code path.
- **`instanceof FsError` pass-through in `classifyError()`.** Was only needed for the
  escalation path.

## 0.0.1

### Security

- **CSP + security headers added.** `src/hooks.server.ts` sets Content-Security-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy` on all production responses. Dev mode bypassed to keep Vite HMR working. Nonce-based CSP was attempted but blocked by Vite-plugin PWA injecting inline scripts outside SvelteKit's nonce pipeline. The final CSP uses `'unsafe-inline'` for scripts and styles (safe because Svelte auto-escapes all `{expression}` content and zero `{@html}` directives exist) while locking down all external origins, framing, and form actions.
- **Full XSS audit passed.** Zero `{@html}`, `innerHTML`, or unsafe rendering paths across all 11 Svelte components. All user content rendered through Svelte auto-escaping.
- **Path traversal audit passed.** File System Access API enforces directory containment; only bare filenames reach `getFileHandle()`.
- **Dependency audit.** All 19 findings from `pnpm audit` confirmed build-time only (tar, brace-expansion, vite, postcss, etc.) or irrelevant to this app's architecture (SvelteKit form actions, cookies). `@sveltejs/kit` bumped to 2.70.1, `vite` to 8.1.5, clearing 5. Remaining 10 are deep transitive build-tooling — zero runtime impact. PWA inline registration disabled (`injectRegister: null`) to reduce inline script surface.

- **Backlog parent checkbox now cycles through in-progress.** Clicking the checkbox on a backlog task with subtasks first sets `[-]` in-progress; second click completes and moves to today.

- **Subtasks auto-propagate to parent.** Checking any subtask moves the parent to in-progress. Checking the last remaining subtask auto-completes the parent (backlog: auto-moves checked block to today). Unchecking reverses the cascade.

- **`pnpm start` script added.** Builds the production bundle then serves it locally via `vite preview`.
