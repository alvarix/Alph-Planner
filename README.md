# Alph-Planner

Weekly task planner PWA. Your Markdown daily notes in Obsidian are the source of truth — the app is a read/write view over those files. No database, no sync service, no lock-in.

## How it works

Point the app at the folder where your Obsidian daily notes live. It reads one `.md` file per day plus a `Backlog.md` for floating tasks. Everything you see in the app lives in those files; everything you do in the app writes back to them immediately.

Open the same folder in Obsidian and edits appear in the app on the next focus. The app is optional — your files are always readable without it.

## File format

```markdown
# Work
- [ ] **ship invoice** 1h
  - [ ] draft
  - [x] send

# Personal
- [ ] groceries
- [x] gym
```

| Element | Meaning |
|---|---|
| `# Category` | Optional H1 section header — tasks below inherit the category |
| `- [ ] title` | Unchecked task |
| `- [x] title` | Done task |
| `**bold title**` | Starred (priority) task |
| `30m` / `1h` / `1.5h` | Optional duration estimate at end of title |
| Indented `- [ ]` | Subtask — moves with parent, expands on click |

- Date comes from the filename (`YYYY-MM-DD.md`), not from a heading
- `Backlog.md` follows the same format; H1 categories work there too
- `![[Backlog]]` Obsidian embeds are preserved verbatim and ignored by the parser
- All unknown lines (prose, frontmatter, blank lines) survive any write-back byte-identical

## Backlog

`Backlog.md` in the same folder holds free-form todos without a specific day. Unchecked tasks from past daily files surface here with a red date tag. Drag any backlog item into a day column, or use "Roll all" to move everything to today.

Use the **+** button in the backlog header to add a task directly to `Backlog.md`. If categories already exist in the backlog a dropdown lets you assign one. Subtasks are shown indented under their parent in the rail.

## Task actions

| Action | How |
|---|---|
| Check / uncheck | Checkbox |
| Star / unstar | ★ button (shows on hover) |
| Edit title | Double-click the title |
| Delete | ✕ button (shows on hover) → confirm with **del** |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `n` | Focus add-task input for today |

## Local dev

```sh
pnpm install
pnpm dev               # http://localhost:5173
pnpm test:unit         # Vitest unit tests (parser + serializer)
pnpm test              # Playwright smoke tests
pnpm check             # TypeScript + Svelte type check
```

## Stack

- SvelteKit 5 (runes mode), Vite 8, adapter-vercel
- File System Access API for local file read/write (Chromium only)
- IndexedDB for persisting the directory handle across reloads
- vite-plugin-pwa (service worker, installable)
- Vitest for unit tests, Playwright for smoke tests

## Browser support

Requires a Chromium browser (Chrome, Edge, Arc) for the File System Access API. Safari and Firefox are not supported.

## Running persistently (always-on localhost)

The app requires a server process to be running — there is no static file you can just open. When the process stops, `localhost` goes dark and the installed PWA shows a network error.

### Why you need a persistent process

This is a SvelteKit app served by Vite. The browser's File System Access API and IndexedDB still work offline once the page has loaded, but the initial page load (and any hard reload) must reach the local server. The PWA service worker caches assets after the first load, so the app can survive brief network blips, but a full server restart or machine reboot will break it until the server is running again.

### Setup (first time)

```sh
pnpm add -g pm2
pnpm build
pm2 start "pnpm exec vite preview --port 5177" --name alph-planner
pm2 save
pm2 startup    # prints a command — run it to survive reboots
```

The app is available at `http://localhost:5177`. Open it in Chrome and install via the address bar icon.

### After a code change

```sh
pnpm build && pm2 restart alph-planner
```

The service worker updates automatically on the next page load. If the app shows stale content: DevTools → Application → Service Workers → **Update** → reload.

### Useful pm2 commands

```sh
pm2 status                 # see if the process is running
pm2 logs alph-planner      # tail the server log
pm2 restart alph-planner   # restart after a build
pm2 stop alph-planner      # stop without removing
pm2 delete alph-planner    # remove from pm2 entirely
```

**Note:** `pnpm dev` does not activate the service worker, so the install prompt will not appear in dev mode.

## Folder connection and recovery

The browser's File System Access API requires permission to read and write your folder. Permission is granted once via the native folder picker and stored in IndexedDB, but Chrome may revoke it after a page reload or overnight.

When that happens the app detects it automatically on the next window focus and shows the picker overlay. Three topbar controls are always available:

| Control | When to use |
|---|---|
| **Sync** | Re-read all files from disk without leaving the tab (also fires on every window focus) |
| **Change folder** | Reselect or reconnect your folder — same as the initial setup flow |
| **Reconnect folder** | Appears in crimson when permission has lapsed — one click to re-grant |

If the app shows empty columns or a missing Backlog after a reload, click **Change folder** and re-select the same folder. No data is lost — all content lives in your `.md` files.

**iCloud users**: files being actively synced by iCloud are temporarily locked. The app skips applying recurring defaults to locked files and retries on the next focus — you will not lose data or see stale tasks as a result.

## Troubleshooting

### App loads with no data after a deploy

**Symptom:** columns are empty, "Refresh failed" toast appears with a file-modification error, re-picking the folder does not fix it.

**Cause:** the PWA service worker is serving a stale cached bundle that predates a deployed fix. A normal reload does not always swap the SW-cached assets — you are running old code against a new deploy.

**Fix (30 seconds):**
1. DevTools → Application → **Service Workers → Unregister**.
2. DevTools → Application → **Storage → Clear site data**.
3. Hard reload (Cmd+Shift+R) and re-pick your folder.

This clears only cached app assets — your `.md` files are untouched.

### Edits not saving

If task check/uncheck or text edits do not appear in your `.md` files after a save attempt, the folder may have lost write permission. Click **Reconnect folder** in the topbar. If that does not help, hard reload and re-pick the folder — this discards a stale file handle that may have accumulated OS-level locks across deploys.

## Data

Source of truth is your local Markdown files. The app holds an in-memory cache rebuilt from disk on every window focus and after every write. Deleting the app or clearing browser data does not affect your files.

## Architecture

See `docs/markdown-first-plan.md` for the full design spec and `docs/postmortem-grid-version.md` for why the v0 time-slot grid was retired.
