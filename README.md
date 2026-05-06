# Alph-Planner

Weekly task planner PWA. Type tasks in a terse syntax (or paste a Markdown checklist), auto-schedule them into a 7-column week grid, drag sessions between slots, and track what's done.

## Task syntax

```
draft email .5h x2, p2
ship invoice 1h, p1
deep work 2h x3, p3
stand-up 15m
buy milk          ← no duration → 30m default, p3
```

| Token | Meaning | Default |
|---|---|---|
| `title` | Free text before the first duration token | required |
| `1h` / `.5h` / `90m` | Session duration (15 min – 8 h) | 30m |
| `xN` | Number of sessions (e.g. `x3` = three separate slots) | 1 |
| `pN` | Priority 1–4, p1 = highest | 3 |

Tasks with no duration are accepted and get a 30m / p3 default. Only completely blank lines are ignored.

## Markdown import

Paste a GitHub-style checklist directly into the input and press Add:

```markdown
# Week plan

- [ ] fix bug 1h p1
- [x] already done 1h
- [ ] review PR .5h x2, p2

## Side project
- [ ] refactor auth 2h p3
```

- Unchecked items (`- [ ]`) are imported; checked (`- [x]`) are skipped
- `# Headings` and `## Sections` are skipped
- Indented subtasks become `parent: child` — e.g. `fix bug: add test 30m`
- Items with no duration get the 30m / p3 default

## Keyboard shortcuts

| Key | Action |
|---|---|
| `n` | Focus task input |
| `Cmd+Enter` | Add tasks |
| `Escape` | Cancel inline edit or dismiss done/remove prompt |

## Week grid

- Sessions are colour-coded by priority (red → orange → blue → grey)
- **Drag** a session to move it; drop it outside all day columns to send it to Overflow
- **Click ✓** on a session → choose **Done** (logged to Done tab) or **Remove** (discarded)
- Weather forecast appears in day headers (browser geolocation, falls back to Brooklyn 11238)

## Task list

- **Click** any task row to edit inline (title, duration, sessions, priority)
- Press **Enter** to save, **Escape** to cancel
- **✕** on a row removes the task and all its sessions
- **Clear all tasks** button at the bottom (requires confirmation)

## Overflow / Done panel

Right rail has two tabs:

- **Overflow** — sessions that didn't fit the week; drag them onto the grid to schedule manually; *Roll to next week* clears the list
- **Done** — completed sessions in reverse-chronological order; persists across reloads

## Config

Click **⚙** in the top bar:

- Hours per day (Mon–Sun; weekends hidden until toggled on)
- Block-offs: recurring (`Every weekday`) or per-day (e.g. dentist on Wed)
- Export / Import JSON backup
- Reset everything

## Scheduling

The auto-scheduler sorts tasks by priority (p1 first), then spreads sessions across days with the most remaining capacity rather than filling Monday first. Sessions of the same task are placed on different days when possible. Anything that doesn't fit goes to Overflow.

## Local dev

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Playwright smoke tests
npm run check      # TypeScript + Svelte type check
```

## Stack

- SvelteKit 5 (runes mode), Vite 8, adapter-vercel
- vite-plugin-pwa (service worker, installable)
- Native HTML5 drag-and-drop
- Open-Meteo weather API (free, no key)
- Playwright for tests

## Deploy

Connect the repo to a Vercel project. `adapter-vercel` handles the build. No environment variables required.

## Data

State is saved to `localStorage` under `alph-planner-v1`. Use Config → Export JSON to back up or move data between devices.

## Dev: state history and recovery

When running `npm run dev`, the app automatically writes a timestamped JSON snapshot to `snapshots/` after every state change (debounced 500ms). Up to 500 snapshots are kept; older ones are pruned automatically.

**This is dev-only.** The snapshot endpoint is hard-gated on the `dev` flag from `$app/environment` — it returns 405 in `npm run preview` and in production. Nothing is shipped to Vercel. No configuration required to enable it; it runs whenever you run `npm run dev`.

**There is no on/off toggle.** Snapshots are always captured during dev. They are fire-and-forget — if the write fails (e.g. disk full) the app ignores it.

### Listing snapshots

```sh
ls -t snapshots/ | head -20
```

### Recovering a past state

1. Pick a file by timestamp:
   ```sh
   ls -t snapshots/ | head -20
   ```
2. Copy it to the clipboard:
   ```sh
   pbcopy < snapshots/2026-05-06T13-42-03-512Z.json
   ```
3. In the browser devtools Console, paste and run:
   ```js
   localStorage.setItem('alph-planner-v1', '<paste here>')
   ```
4. Reload the page.

### File format

Each file is plain JSON matching the `alph-planner-v1` localStorage shape:

```json
{ "tasks": [...], "sessions": [...], "unscheduled": [...], "done": [...], "config": {...} }
```

The filename is the ISO timestamp of the write, colons and dots replaced with dashes.

See `docs/features.md` for the full feature reference and `docs/wishlist.md` for planned work.
