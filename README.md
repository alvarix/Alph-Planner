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
npm install
npm run dev            # http://localhost:5173
npm run test:unit      # Vitest unit tests (parser + serializer)
npm test               # Playwright smoke tests
npm run check          # TypeScript + Svelte type check
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

### Option A — keep the dev server running (simplest, hot-reload)

Use pm2 to manage the process so it survives terminal closes and reboots:

```sh
npm install -g pm2
pm2 start "npm run dev -- --port 5177" --name alph-planner
pm2 save                   # persist the process list
pm2 startup                # print a command — run that command to survive reboots
```

The app is available at `http://localhost:5177`. pm2 will restart it automatically if it crashes.

Useful pm2 commands:

```sh
pm2 status                 # see if the process is running
pm2 logs alph-planner      # tail the server log
pm2 restart alph-planner   # restart after code changes
pm2 stop alph-planner      # stop without removing
pm2 delete alph-planner    # remove from pm2 entirely
```

**Note:** The dev server does not activate the PWA service worker. Hot-reload works, but offline support and "install to desktop" are dev-only stubs.

### Option B — build and serve the production bundle (full PWA)

This activates the service worker, enables real offline support, and is closer to what a deployed version would look like. Rebuild and restart whenever you update the code.

```sh
npm run build
pm2 start "npm run preview -- --port 5177" --name alph-planner
pm2 save
pm2 startup
```

After a code change:

```sh
npm run build
pm2 restart alph-planner
```

The first time you load the app after a fresh build the service worker installs and caches all assets. Subsequent loads are served from cache and work without network.

### Updating the installed PWA after a code change

The installed app is tied to the origin (`localhost:5177`). Keep the port stable so the browser reuses the same PWA installation.

1. Make your code changes.
2. If using Option A, Vite hot-reloads most changes — no restart needed.
3. If using Option B, run `npm run build && pm2 restart alph-planner`.
4. Open Chrome at `chrome://apps` or click the installed Alph-Planner icon.
5. If the app shows stale content: DevTools → Application → Service Workers → **Update** → reload.

## Data

Source of truth is your local Markdown files. The app holds an in-memory cache rebuilt from disk on every window focus and after every write. Deleting the app or clearing browser data does not affect your files.

## Architecture

See `docs/markdown-first-plan.md` for the full design spec and `docs/postmortem-grid-version.md` for why the v0 time-slot grid was retired.
