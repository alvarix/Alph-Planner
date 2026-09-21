# 12 — Status

**Task:** Backlog bugs — lost categories on week roll
**Status:** Bug 1 fixed (needs user verification); Bugs 2 and 3 open
**Updated:** session of 2026-08 (see `docs/12--usr--backlog-bugs.md` for the task list)

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
| `src/lib/state.test.ts` | 1 new integration test |
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
