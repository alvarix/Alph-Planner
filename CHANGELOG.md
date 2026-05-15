# Changelog

## [1.3.0] - 2026-05-15

### Added
- TaskRow: subtask titles and checkboxes now shown inline below the parent task (always visible, no expand toggle)
- TaskRow: **+ subtask** button in hover strip adds a new child task inline (Enter commits, Esc cancels)
- Notes: panel now fills the full column height when open, replacing the task list area

### Changed
- TaskRow: star, delete, and add-subtask controls moved to a bottom hover-reveal strip; star icon remains visible at all times for starred tasks
- NotesPopover: redesigned from a floating absolute popover to a full-height inline panel with a close button; backdrop removed
- `state.svelte.ts`: added `addSubtask` action — inserts an indented `- [ ]` line after the last child and re-parses

## [1.2.0] - 2026-05-13

### Added
- BacklogRail: tasks now grouped under their H1 category headers, matching the
  structure of `Backlog.md`; overdue items appear under a dedicated "Overdue" header
- BacklogRail: **#** button adds a new category (H1 section) to `Backlog.md`
- BacklogRail: category headers show a **×** delete button on hover with
  **del / no** confirmation; removes the `# Heading` line, tasks remain
- BacklogRail: star button (★) per task — appears on hover, amber when starred
- BacklogRail: accepts drag-and-drop from day columns; dropping a task on the
  rail moves it to `Backlog.md`
- DayColumn: **# cat** footer button adds a new category to the current day file
- DayColumn: category section headers show a **×** delete button on hover with
  inline confirmation
- DayColumn: task height scaled by estimate — 80 px base (≤ 0.5 h), +25 px per
  additional 0.25 h (e.g. 1 h → 130 px, 2 h → 230 px)
- DayColumn: weekend columns (Sat/Sun) rendered at 70 % width with a grey
  background to de-emphasise non-work days
- DoneLog: converted from a fixed bottom strip to a slide-up drawer
  (`position: fixed`, 300 px tall, `fly` transition); includes its own **×**
  close button

### Changed
- `serialize.ts`: added `addCategoryHeader` and `removeCategoryHeader` helpers
- `state.svelte.ts`: added `addCategoryToFile` and `deleteCategoryFromFile`
  actions backed by the new serialize helpers

## [1.1.0] - 2026-05-12

### Added
- BacklogRail: subtasks shown indented under their parent item
- BacklogRail: **+** button adds a task directly to `Backlog.md`; category
  dropdown auto-populated from existing H1 sections in the backlog
- TaskRow: double-click title to edit inline (Enter to save, Esc to cancel)
- TaskRow: delete requires inline confirmation (**del** / **no**) to avoid
  accidental data loss

## [1.0.1] - 2026-05-12

### Fixed
- PWA installed app crashed with `non-precached-url: index.html` — set
  `workbox.navigateFallback: null` and removed `.html` from glob patterns;
  SSR (adapter-vercel) has no static index.html to precache

## [1.0.0] - 2026-05-12 (markdown-first rewrite)

Complete rewrite on the `markdown-first` branch. v0 grid archived as `v0-grid-archive`.

### Added
- File System Access API folder picker — points app at local Markdown daily notes
- IndexedDB persistence for directory handle (silent re-grant across reloads)
- `src/lib/md/parse.ts` — pure TS parser: H1 categories, starred (`**bold**`),
  duration (`1h`/`30m`/`1.5h`), subtasks, `![[Obsidian]]` embeds preserved
- `src/lib/md/serialize.ts` — line-preserving write-back: only the mutated line
  changes; all other lines (prose, blank, frontmatter) survive byte-identical
- 44 unit tests (Vitest) covering parse + serialize round-trip invariants
- `DayColumn` + `TaskRow` components rendering from parsed files
- `FolderPicker` overlay with permission re-grant flow
- Checkbox write-back wired to disk (task and subtask)
- `Backlog.md` as the canonical floating-task store
- iCloud conflict-file detection (`filename (MacBook).md`)
- Window-focus cache refresh

### Removed
- Time-slot grid, auto-scheduler, block-offs, priority pills (p1–p4)
- localStorage as source of truth
- Weather widget
- Inbox rail, Unscheduled rail, Config drawer

### Changed
- Priority model: bold title = starred only. No numbered levels.
- Source of truth: `YYYY-MM-DD.md` daily files + `Backlog.md`
- Subtasks get a color-matched left accent per parent group

---

## [0.5.0] - 2026-05-06

### Added
- Checked markdown items (`- [x]`) now import into the Done tab instead of
  being silently dropped; nested checked items become "parent: child" entries
- `addDoneItems()` store action for direct done-list injection

### Fixed
- Multi-select bulk action bar only appeared after Select All (Set mutation
  doesn't trigger Svelte 5 re-render); fixed by replacing Set on each toggle

## [0.4.0] - 2026-05-05

### Added
- Markdown task-list import: paste `- [ ] task 1h p2` blocks directly into
  the Inbox; headings, checked items, and no-duration lines are skipped silently
- Parser: bare decimal durations (`.5`, `.25`) now treated as hours
- Parser: attached xN (`1hx2`) recognised alongside spaced form (`1h x2`)
- 3 new Playwright tests covering the markdown and parser edge cases

## [0.3.0] - 2026-05-05

### Fixed
- Blank page on load: `structuredClone` cannot clone Svelte 5 `$state` Proxies;
  replaced all three call-sites in ConfigDrawer with `$state.snapshot()`
- `vite-plugin-pwa@1.2.0` peer dep conflict with Vite 8; bumped to 1.3.0
- Removed `engine-strict=true` from `.npmrc` (Node 24 caused false rejections)

### Added
- Playwright test suite (`tests/app.test.ts`) — 7 smoke tests covering load,
  task input, scheduling, config drawer, and localStorage persistence
- `docs/testing.md` — plain-English guide to running and writing tests
- `playwright.config.ts` with auto-start dev server

## [0.2.0] - 2026-05-05

### Added
- Week weather overview via Open-Meteo

## [0.1.0] - 2026-05-05

### Added
- Task input with terse syntax parser
- Greedy priority-first weekly scheduler
- Draggable week grid with 30-min slots
- Unscheduled overflow rail, config drawer, localStorage persistence
- Mobile layout, PWA manifest, Vercel deployment
