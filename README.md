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

## Updating the installed app (localhost:5177)

The app runs as an installed PWA from the local dev server. After pulling or editing code:

```sh
# close port 5177
sudo kill -9 $(sudo lsof -t -i:5177) 2>/dev/null
npm run dev -- --port 5177   # keep the port stable so the installed app re-uses the same origin
```

1. Make your code changes.
2. Vite hot-reloads most changes automatically — no reinstall needed.
3. For changes to `vite.config.ts` or the service-worker manifest, stop and restart the dev server.
4. Open Chrome at `chrome://apps` or the address bar, click the installed Alph-Planner icon.
5. If the app shows stale content, open DevTools → Application → Service Workers → click **Update**, then reload.

## Data

Source of truth is your local Markdown files. The app holds an in-memory cache rebuilt from disk on every window focus and after every write. Deleting the app or clearing browser data does not affect your files.

## Architecture

See `docs/markdown-first-plan.md` for the full design spec and `docs/postmortem-grid-version.md` for why the v0 time-slot grid was retired.
