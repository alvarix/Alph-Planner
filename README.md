# Alph-Planner

Weekly task planner PWA. Your Markdown daily notes in Obsidian are the source of truth — the app is a read/write view over those files. No database, no sync service, no lock-in.

## How this app is run — READ THIS FIRST

There are exactly two states. This is **not** a standalone Mac app — do not build it locally for use.

| State | What it is | How |
| --- | --- | --- |
| **Normal use (production)** | The live app on Vercel | `git push` to `main` — Vercel builds and deploys automatically. Nothing to run locally. |
| **Developing (local)** | Vite dev server on your Mac | `pnpm dev` (or the PM2 process below) at http://localhost:5173 |

**After a code change while developing:**

1. Save the file — the browser tab at localhost:5173 hot-reloads automatically
2. Hard-reload the tab (Cmd+Shift+R) if HMR misbehaves (e.g. after edits to `state.svelte.ts`)
3. Happy with it? `git push` — that deploys to production. `pnpm build` runs on Vercel, not on your Mac.

**You do not need `pnpm build` or `pnpm preview` for daily work.** They exist only to sanity-check a production bundle locally (`pnpm build && pnpm preview` at http://localhost:4173) — rarely necessary since Vercel builds the same thing on push.

## Local development

```sh
pnpm install
pnpm dev               # http://localhost:5173 (development server with HMR)
pnpm test:unit         # Vitest unit tests
pnpm test              # Playwright smoke tests
pnpm check             # TypeScript and Svelte type checking
```

`pnpm build` / `pnpm preview` are only for sanity-checking a production bundle locally (see the top of this file); normal deployment happens on Vercel via `git push`.

`pnpm start` is an alias for the development server on port 5173. It remains attached to the terminal, so do not chain it before another command with `&&`.

### Optional: persistent local dev server with PM2

Keeps the **dev** server running after you close the terminal. It is a development convenience only — production runs on Vercel.

#### First-time setup

```sh
pnpm add -g pm2
pm2 start pnpm --name alph-planner -- run start
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup` to configure startup after a reboot. The app is then available at `http://localhost:5173`.

#### After a code change

Nothing to do — save the file and the browser tab hot-reloads. Only restart PM2 if the dev server itself crashed:

```sh
pm2 restart alph-planner
```

If `Process or Namespace alph-planner not found` appears, run `pm2 status`. If the table is empty, try `pm2 resurrect`; if `alph-planner` is still absent, re-register it from this repo's directory:

```sh
cd ~/Sites/apps/Alph-Planner
pm2 start pnpm --name alph-planner -- run start
pm2 save
```

Run PM2 as the same user each time. Using `sudo pm2` or another user opens a different PM2 process table and can make an existing process appear missing.

Useful diagnostics:

```sh
pm2 status
pm2 logs alph-planner --lines 30
pm2 describe alph-planner
```

The service worker updates on the next page load after a production deploy. If stale content remains, open DevTools → Application → Service Workers, select **Update**, and reload.

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
| --- | --- |
| `# Category` | Optional H1 section header — tasks below inherit the category |
| `- [ ] title` | Todo (unchecked) |
| `- [-] title` | In progress |
| `- [x] title` | Done |
| `**bold title**` | Starred (priority) task |
| `30m` / `1h` / `1.5h` | Optional duration estimate at end of title |
| Indented `- [ ]` | Subtask — moves with parent, expands on click |

- Date comes from the filename (`YYYY-MM-DD.md`), not from a heading
- `Backlog.md` follows the same format; H1 categories work there too
- `![[Backlog]]` Obsidian embeds are preserved verbatim and ignored by the parser
- `Planner Archive.md` follows the same format, organized under `## Archived YYYY-MM-DD` date headings with category H1s nested inside (see Archive below)
- All unknown lines (prose, frontmatter, blank lines) survive any write-back byte-identical

## Backlog

`Backlog.md` in the same folder holds free-form todos without a specific day. Unchecked tasks from past daily files surface here with a red date tag. Drag any backlog item into a day column, or use "Roll all" to move everything to today.

When you view a fully-past week that still has unfinished tasks, a **Roll week to backlog** button appears in the topbar. It moves every todo and in-progress task from that week's daily files into `Backlog.md` under a visible `## Added week of YYYY-MM-DD` heading, so last week's arrivals sit separated from older backlog content. Done tasks stay in their daily files. Tasks you add manually to the backlog without a category land under the current week's heading too. The operation is safe to repeat — an already-rolled week has nothing left to move.

Use the **+** button in the backlog header to add a task directly to `Backlog.md`. If categories already exist in the backlog a dropdown lets you assign one. Subtasks are shown indented under their parent in the rail.

## Archive

Backlog rows have an **arch** button (shows on hover) that moves the task — with children, category, and checkbox state — out of the backlog into `Planner Archive.md`. Each move is stamped under a chronological `## Archived YYYY-MM-DD` heading (the day you archived it), with the task's category H1 nested inside the date section, e.g.

```markdown
## Archived 2026-05-04

# Work
- [ ] stale item 1h
```

Archived items stay fully editable in Obsidian — the archive is just another markdown file.

A collapsible **Archive** section at the bottom of the backlog rail (closed by default, with an item count badge) lists archived tasks **grouped by category** — each group under its small uppercase header, uncategorized items last, tasks in chronological order within a group, each with its archive date. Each row has a **restore** button that moves the task back to `Backlog.md` — under its original category (recreated if missing), or the current week's section if it had none. The standard delete button removes an archived item permanently. The archive is safe to copy from and rearrange by hand; just keep tasks under an `## Archived` heading so they keep their date, and don't paste `## Added week of` lines in — those reset the archived-date context.

## Task actions

| Action | How |
| --- | --- |
| Check / cycle state | Checkbox cycles todo → in-progress → done. For backlog tasks with children, the first click sets in-progress and the second click completes (moves to today). Checking individual subtasks auto-propagates: any active child sets the parent to in-progress; all children checked completes the parent automatically. |
| Star / unstar | ★ button (shows on hover) |
| Edit title | Double-click the title |
| Edit duration | Double-click the time badge (e.g. `1h`) — accepts `2h`, `30m`, bare minutes like `90`, or empty to clear |
| Edit subtask | Double-click the subtask title |
| Delete | ✕ button (shows on hover) → confirm with **del** |
| Move to backlog | **bl** button (shows on hover) on any task — short press moves it to `Backlog.md` |
| Archive / archive from backlog | Hold **bl** ~0.5s to archive the task; on backlog rows the same button reads **arch** and short press archives directly |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `n` | Focus add-task input for today |

## Info drawer

Click the **i** button in the top-right corner of the header to open the right-side drawer. Three tabs:

| Tab | Purpose |
|---|---|
| Info | Explains every button and feature — built-in help |
| Options | Upcoming toggle, Colon shortcut, Sync, Change folder, vault name, conflict warnings |
| History | Session change log — every task mutation as a timestamped entry (resets on reload) |

## Stack

- SvelteKit 5 (runes mode), Vite 8, adapter-vercel
- File System Access API for local file read/write (Chromium only)
- IndexedDB for persisting the directory handle across reloads
- vite-plugin-pwa (service worker, installable)
- Vitest for unit tests, Playwright for smoke tests

## Browser support

Requires a Chromium browser (Chrome, Edge, Arc) for the File System Access API. Safari and Firefox are not supported.

## Folder connection and recovery

The browser's File System Access API requires permission to read and write your folder. Permission is granted once via the native folder picker and stored in IndexedDB, but Chrome may revoke it after a page reload or overnight.

When that happens the app detects it automatically on the next window focus and shows the picker overlay. Three topbar controls are always available:

| Control | When to use |
| --- | --- |
| **Sync** | Re-read all files from disk without leaving the tab (also fires on every window focus) |
| **Change folder** | Reselect or reconnect your folder — same as the initial setup flow |
| **Reconnect folder** | Appears in crimson when permission has lapsed — one click to re-grant |

If the app shows empty columns or a missing Backlog after a reload, click **Change folder** and re-select the same folder. No data is lost — all content lives in your `.md` files.

## Troubleshooting

### App loads with no data (columns empty, errors in console)

**Symptom:** columns are empty, "Refresh failed" or "File temporarily locked or inaccessible" toast appears, re-picking the folder does not fix it.

**Cause (most common):** the PWA service worker is serving a stale cached bundle from a previous deploy. The old code cannot talk to the filesystem correctly.

**Fix — one click:** When the error overlay appears, click **"Clear cache & reload"**. This unregisters the service worker, clears all cached app assets, clears the stored folder handle, and reloads the page. Then re-pick your folder.

**Fix — manual:** DevTools (F12) → Application → **Service Workers → Unregister**, then **Storage → Clear site data**, then hard reload (Cmd+Shift+R) and re-pick.

This clears only cached app assets — your `.md` files are untouched.

### Folder picker keeps re-prompting (cannot select folder)

**Symptom:** you pick a folder, the overlay re-appears, and clicking "Re-grant access" just loops. Console shows `NoModificationAllowedError`.

**Fixes, ordered from fastest:**

1. **"Clear cache & reload" button** (in the error overlay) — one click, fixes stale cache
2. **"Forget folder & start fresh" button** (in the error overlay) — clears the stored handle, then re-pick
3. **Manual:** DevTools → Application → IndexedDB → `alph-planner-fs` → clear, reload, re-pick
4. **Last resort — move to local folder:** if the folder is on iCloud Drive and nothing above works, move your `.md` files to a local folder (e.g. `~/Documents/alph-planner`) and pick that instead. See `docs/icloud-fsaa-postmortem.md` for the full diagnosis.

### Edits not saving

If task check/uncheck or text edits do not appear in your `.md` files after a save attempt, the folder may have lost write permission. Click **Reconnect folder** in the topbar. If that does not help, use the "Clear cache & reload" button in the error overlay.

## Data

Source of truth is your local Markdown files. The app holds an in-memory cache rebuilt from disk on every window focus and after every write. Deleting the app or clearing browser data does not affect your files.

## Architecture

See `docs/markdown-first-plan.md` for the full design spec and `docs/postmortem-grid-version.md` for why the v0 time-slot grid was retired.

## Security

- **XSS**: All user content (task titles, notes, category names) is rendered through Svelte's auto-escaping. Zero `{@html}` directives exist in the codebase.
- **CSP**: Production deployments set Content-Security-Policy headers locking external origins, preventing clickjacking, and blocking form-based data exfiltration.
- **Path traversal**: The File System Access API enforces directory containment — the app cannot read or write files outside the chosen folder.
- **Dependencies**: All `pnpm audit` findings are build-time only or irrelevant to this app's architecture (see `CHANGELOG.md`).
