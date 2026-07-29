# Changelog

## Unreleased

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
