# 13 — llm — status — Archive (Part A: per-task archive button)

**Started/finished:** 2026 session. Part A complete plus iteration 2
(archive dates + rename to `Planner Archive.md` + collapsible Archive
section in the backlog rail). All 198 unit tests passing, `pnpm check`
clean (15 pre-existing warnings, unrelated).

## Shipped (iteration 2 — dates + rename)

- `Archive.md` renamed to `Planner Archive.md`. Single constant
  `ARCHIVE_FILENAME` in `types.ts` referenced by fs layer, state, UI, and
  tests.
- Archive dates: `archiveTask` now routes through a new
  `insertUnderArchiveMarker` serializer — tasks land under
  `## Archived YYYY-MM-DD` headings (chronological), with the category H1
  nested inside, mirroring the week-marker pattern in Backlog.md.
  `insertUnderWeekMarker` was refactored into a shared
  `insertUnderDatedMarker` core; `moveTask` gained an archive-target
  branch.
- Parser: `ARCHIVE_MARKER_RE` sets `task.date` from the marker (does NOT
  reset category, unlike the week marker); week markers clear a stale
  archived date. `Task.date` for archived items is the archive date.
- UI: collapsible Archive section at the bottom of the backlog rail
  (closed by default, badge count, caret). Rows show the archive date;
  "restore" button (no confirm — restoring is non-destructive); standard
  delete works. TaskRow gained `restorable`/`onrestore` props and an
  archive-date badge.
- Tests updated for the rename; archive round-trip now asserts the dated
  marker heading and `task.date`.

## Shipped (iteration 4 — universal bl button)

- User report: arch button appeared only on categorized tasks. Replaced
  the backlog-only `arch` button with a universal button on every task row
  (day columns and backlog): short press moves the task to `Backlog.md`
  (`moveTask`), long press ~0.5s archives it. On backlog rows the button
  reads `arch` and archives on short press (moving to backlog there is a
  no-op). Button `pointerdown` stops propagation so the row's complete
  long-press never fires. Hidden on archive rows (restore/delete there).

## Shipped (iteration 3 — category grouping)

- Archive drawer lists tasks **grouped by category** (header per H1,
  uppercase small label, uncategorized tasks last with no header). Tasks
  keep file order inside each group — which is chronological by archive
  date since the file is date-sectioned. Implemented as an
  `archiveSections` derived grouping in BacklogRail (same pattern as
  `backlogSections`); handles tasks of the same category appearing in
  multiple date sections by merging into one group. Pure UI — no state,
  serializer, or parser changes. Search/filter still deferred.

## Manual-copy compatibility check (user-verified)

Alvar hand-copied legacy tasks into `Planner Archive.md`:

```markdown
## Archived 2026-09-22
- [ ] Blog - Alph planner or WP CI
# PP Posts
- [-] Jif
  - [x] DM
  ...
```

Verified against the parser: date applies to the whole section (including
the nested-category tasks), `# PP Posts` inside the marker is a valid
nested category, legacy `[-]` in-progress parses, mixed child states and
blank-line-free layout all fine. Only caveats documented: a task above any
`## Archived` heading shows dateless, and a pasted `## Added week of` line
would reset the archived-date context for tasks below it (documented in
README's Archive section).

## Shipped (iteration 1 — Part A)

- `archiveTask(task)` / `restoreFromArchive(task)` in `state.svelte.ts` —
  thin wrappers over `moveTask`, so target-first writes, exact-block
  rollback (Bug 03 machinery), category carry, and cache refresh are all
  inherited. No new write path was added (architecture constraint kept).
- `Archive.md` created on demand: `getOrCreateDayContent` returns `""` for
  it (not the `![[Backlog]]` daily template); `listDailyFiles` now includes
  it in the cache on refresh.
- "arch" button in `TaskRow.svelte` controls strip, shown only for
  `Backlog.md` rows, styled like the existing hover-reveal buttons.
- Tests in `state.test.ts`: categorized round-trip (archive → restore,
  `# Work` section preserved both ways), uncategorized round-trip (restores
  into the current week marker section), and a no-op guard for archiving
  an already-archived task.

## Decisions made along the way

- Week-marker heading resets `category` during parse, so a task rolled
  under `## Added week of X` is uncategorized unless it sits under an H1
  *inside* the marker section. The first test seed got this backwards;
  fixed the seed, not the parser.
- Uncategorized archived tasks restore into the current week's marker
  section via the existing Backlog.md branch of `moveTask` — desirable,
  since a restored task becomes "fresh" again.

## Not started

- Part B — Archive drawer UI (restore/delete controls live here; the
  actions already exist and are tested).
- Part C — optional batch sweep of tasks older than 2 weeks.
- Per-task date prop: rejected (see 13--llm--archive.md synopsis); the
  drag-out-loses-week-marker caveat from that discussion remains open as a
  separate backlog bug, not blocking this feature.
