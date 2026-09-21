# 12 — Status

**Task:** Backlog bugs — lost categories on week roll; drag-to-category copy
**Status:** Bugs 1 and 2 fixed (need user verification); Bug 3 verified correct — see note
**Updated:** session of 2026-08 (see `docs/12--usr--backlog-bugs.md` for the task list)

## Bug 2 — items dragged onto a category are copied, not moved — FIXED

**Root cause:** `+page.svelte` clears `draggingTask` (passed down as
`externalDragTask`) in a window-level `ondragend`. That handler fires while
`DayColumn.dropOnSection` is still awaiting `addTask`; the function re-read the
prop after the await, so `deleteTask(externalDragTask)` received `null` and
threw (`TypeError: Cannot read properties of null (reading 'file')`). The task
was added to the target but never removed from the source — a copy.

**Fix:** `DayColumn.dropOnSection` captures `externalDragTask` in a local
`const source` before the first await. BacklogRail's `dropOnSection` already
took the task as a parameter (evaluated at call time) and needed no change.

Verified in the browser with three new Playwright tests:

- day task → backlog category header: moved, appears exactly once
- backlog task → day column category header: moved, removed from Backlog.md
- backlog task → another backlog category: moved within Backlog.md

## Bug 3 — complete/in-progress items from last week in backlog as incomplete — VERIFIED CORRECT

Investigated with an extended E2E test (last week seeded with `todo` + `done`
+ `[>]` in-progress per day, then rolled):

- **Done tasks** are excluded from the roll entirely (they stay in their
  daily files) — they never appear in the backlog.
- **In-progress tasks** roll with their raw `[>]` line verbatim and render
  with the `in-progress` class in the rail — not as incomplete.

If you still see this, it may be the **Overdue** section showing past-day
in-progress tasks (by design, red date tag) — confirm what you observed.

## Bug 1 — backlogged items (incomplete from last week) lose categories — FIXED

**Root cause:** category is derived from the nearest preceding `# H1` at parse
time. `rollWeekToBacklog` (and single-task rollover via `moveTask` with
`weekMarker`) inserted only the task block under `## Added week of YYYY-MM-DD`
in `Backlog.md`. The week-marker heading resets category parsing to `null`, so
every rolled task re-parsed with `category: null` even though its source daily
file had an H1 category.

**Fix:** `insertUnderWeekMarker()` in `src/lib/md/serialize.ts` gained an
optional `category` parameter:

- Week heading exists: the block is placed under (or creates) a `# Category`
  H1 *inside* the week section, so the round-trip restores the category.
- Week heading is newly created: `# Category` is written directly under it.
- New category headings append at the section end (never above existing
  tasks, so earlier uncategorised tasks stay uncategorised).
- `category === null` keeps the previous behavior byte-for-byte.

Call sites updated in `src/lib/state.svelte.ts`:

- `rollWeekToBacklog` — passes `task.category`
- `moveTask` weekMarker branch — passes `task.category` (doc comment updated;
  the old comment claimed this was intentional, it was the bug)

**Edge cases handled:** uncategorised tasks unchanged; same-category tasks
across different days merge into one `# Work` group (no duplicate headings);
section boundaries respect next week heading and the `---` notes divider.

## Test results

```
 Test Files  9 passed (9)
      Tests  193 passed (193)
```

`pnpm check` — 0 errors (15 pre-existing warnings).

New tests:

| File | Tests |
| --- | --- |
| `src/lib/md/serialize.test.ts` | Categorised block under created `# Category` heading; same-category tasks merge into one group; null-category stays uncategorised; category carried into a newly created week heading |
| `src/lib/state.test.ts` | Rolled tasks keep their source category; `# Work` / `# Personal` headings deduplicated across rolled days |

## Files changed

| File | Change |
| --- | --- |
| `src/lib/md/serialize.ts` | `insertUnderWeekMarker` optional `category` param + placement logic |
| `src/lib/state.svelte.ts` | `rollWeekToBacklog` / `moveTask` pass `task.category` |
| `src/lib/md/serialize.test.ts` | 4 new tests |
| `src/lib/components/DayColumn.svelte` | `dropOnSection` captures `externalDragTask` before awaiting (bug 12.2) |
| `tests/app.test.ts` | `html5Drag` helper + 3 drag-to-category move tests; roll test extended for bug 12.3 |
| `src/lib/state.test.ts` | 2 new dropOnSection file-layer tests |
| `README.md` | Rebuilt: two run states (Vercel production via `git push`; local Vite dev via `pnpm dev`/PM2), removed wrong `pnpm build && pm2 restart` advice |
| `docs/12--usr--backlog-bugs.md` | Task list (unchanged, reference) |

## Open — Bugs 2 and 3

- **Bug 2** — items dragged off backlog onto a category are copied, not moved
  (they move correctly when dragged onto a day). Investigation so far: the
  drop paths are `dropOnSection()` in `BacklogRail.svelte` →
  `moveToCategoryInFile()` (same-file) or `addTask` + `deleteTask`
  (day-file source). Both look correct on paper and are covered by
  `relocateTask` staleness handling — suspected to be a UI/DnD state issue
  rather than a file-write bug. Needs reproduction, next session.
- **Bug 3** — complete or in-progress backlogged items (from last week) show
  as incomplete in the backlog. Not yet investigated.
