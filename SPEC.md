# Alph-Planner

Daily task planner PWA over a folder of plain markdown files. The
user's daily MD files in `MasterAlf/` are the single source of truth.
The app reads, renders, and edits those files. It owns no state of
its own.

## Goals

- Capture tasks fast (one line, terse syntax)
- See the week as columns of tasks pulled from per-day MD files
- Re-plan by dragging tasks between days and reordering within a day
- Star tasks for priority (renders as bold in Obsidian outline view)
- Surface unchecked past tasks ("overdue") and roll them forward
- Work offline, install to home screen
- Deploy to Vercel (preview per branch)
- Files-as-database: zero proprietary state, fully readable in any
  text editor or Obsidian

## Non-goals

- Multi-user / cloud sync (rely on iCloud / Obsidian sync for the
  files themselves)
- Calendar integration (Google, iCal)
- Time-of-day scheduling. Day-level granularity only; ordering within
  a day is by line order, not clock time.
- Recurring tasks
- Multi-session tasks. One task = one line. Multi-day work = put it in
  multiple files.
- Mobile-first (responsive yes, but designed desktop-first)

## File format

One file per day in the user's chosen folder.

Filename: `YYYY-MM-DD.md` (e.g. `2026-05-05.md`). ISO format because
it's sortable in Finder and unambiguous internationally.

Contents:

```markdown
# 2026-05-05
- [ ] **fix tax return** 1h
	- [x] call mike
	- [ ] call IRS
- [x] alph-planner 30m
- [ ] groceries
```

Grammar:

- H1 on first non-blank line = the date for this file. Required.
- Top-level `- [ ]` or `- [x]` line = a task. Order in file = order
  in the day's column.
- Indented children of a task = subtasks / notes. Travel with the
  parent. Not scheduled independently in v1.
- `**bold title**` on a task line = starred (priority).
- Optional trailing duration token: `30m`, `1h`, `1.5h`, `90m`. Reuses
  the existing `parser.ts` duration grammar.
- No `xN` session count. No `pN` priority levels — star or no star.
- Anything else in the file (frontmatter, blank lines, free text
  between tasks, headings other than the H1 date) is preserved
  verbatim on write-back.

## Views

Three regions:

1. **Week strip** — N columns (default 7), each one a day. Today
   highlighted. Each column lists the top-level tasks from its file
   in file order. Empty/missing file = empty column. Click "+" or
   double-click the column to create the file lazily on first write.
2. **Overdue rail** — left rail listing every unchecked top-level
   task from any past-dated file. Drag to a day or click "Roll all"
   to bulk-move into today.
3. **New task input** — terse one-line input. Default target = the
   focused day's column (today by default). Hotkey `n`.

Optional toggleable view:

- **Done log** — scans past N days of files for `[x]` lines, grouped
  by date. Free, since the files have it.

## Interactions

- Click checkbox → rewrites the line's `[ ]` ↔ `[x]` in its file.
- Drag task between days → remove line from source file, append to
  target file. Two-step write: target first, then source. Rollback if
  the source write fails.
- Drag to reorder within a day → rewrite that file with reordered
  task lines.
- Edit title inline → rewrite the line.
- Star/unstar → toggle `**` around the title in the line.
- Delete → remove the line (and any indented children) from the file.
- Keyboard: `n` new task, `enter` submit, arrow keys to navigate
  columns.

## Data model

There is no internal data model. The files are the model. In memory
the app holds a parsed cache for performance:

```ts
type Task = {
  file: string;          // "2026-05-05.md"
  date: string;          // "2026-05-05"
  lineRange: [number, number]; // for write-back
  title: string;
  starred: boolean;
  estimateMin: number | null;
  done: boolean;
  children: Task[];      // subtasks
  raw: string;           // original line, for round-trip
};
```

The cache invalidates on window focus and after every write. No
reconciliation, no conflict resolution beyond detecting iCloud
conflict filenames (e.g. `2026-05-05 (alvar's MacBook).md`) and
surfacing a banner.

## Round-trip guarantee

The app's most important invariant: **parse → serialize without
modification = byte-identical to the original file**. Tested directly
against real files from the user's folder. Every edit only touches
matched task lines; everything else is preserved verbatim.

## File system access

Browser File System Access API (Chromium browsers). On first launch
the user picks the folder. The directory handle is stored in
IndexedDB and re-used on subsequent launches with a permission prompt
only when needed.

If the API is unavailable (Safari, Firefox), the app falls back to a
read-only mode using uploaded files, with a clear message that
writing isn't supported in this browser.

## Configuration

Minimal:

- Folder handle (chosen on first launch, persisted in IndexedDB).
- Number of days visible in the week strip (default 7, configurable).
- Done log lookback window (default 30 days).

No weekday/weekend split, no per-day hour caps, no block-offs, no
schedule direction. The app does not schedule; the user does.

## Stack

- SvelteKit + TypeScript (kept from current app)
- vite-plugin-pwa for service worker + manifest
- date-fns for date math
- svelte-dnd-action for drag-and-drop
- idb-keyval for the directory handle in IndexedDB

No backend. No env vars. No secrets.

## Deployment

Vercel, `@sveltejs/adapter-vercel`. Same project as the current app.
Every PR gets a preview URL; `main` deploys to production.

The previous time-slot grid version is preserved on the
`v0-grid-archive` git tag.

## Build estimate

**~12 hours** across 6 phases. See
[docs/markdown-first-plan.md](docs/markdown-first-plan.md) for the
phase breakdown and per-phase test plan.

## Migration

This app replaces the prior weekly-plan workflow:

- Old: occasional LLM prompt distributing tasks over a weekly plan
  file like `week plan 050526.md`.
- New: tasks live in per-day files (`2026-05-05.md`, etc.) edited
  freely in Obsidian or in the app.

There is no automated migration. Existing weekly plan files remain
untouched in `MasterAlf/`; new daily files are created alongside.

## Open questions

- Should the week start on Mon or Sun (configurable later)?
- Done log: persist across all time, or rolling N-day window?
- Mobile target: read-only, or full editing? (FS Access API is
  desktop-Chromium; mobile is currently read-only by stack
  constraint.)
- iCloud conflict files: surface and let user resolve, or attempt an
  auto-merge of unique lines?

## Milestones

1. **M1 — Read-only week view**: folder picker, parse, render today's
   file. First Vercel preview live. Round-trip test passing.
2. **M2 — Edit**: checkbox toggle, reorder within a day, line-preserving
   write-back.
3. **M3 — Cross-day**: week strip, drag between days with rollback.
4. **M4 — Overdue rail**: scan past files, roll forward.
5. **M5 — Capture & polish**: new task input, star toggle, estimate
   edit, done log, refresh on focus, PWA install pass.
