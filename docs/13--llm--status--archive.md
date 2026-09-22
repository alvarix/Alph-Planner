# 13 — llm — status — Archive (Part A: per-task archive button)

**Started/finished:** 2026 session. Part A complete, tested, all 198 unit
tests passing, `pnpm check` clean (15 pre-existing warnings, unrelated).

## Shipped

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
