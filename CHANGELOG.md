# Changelog

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
