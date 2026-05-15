# 6 — Default tasks (LLM spec)

Response to `6--usr--default-tasks.md`. Goal: add weekly / monthly
recurring task templates without breaking the markdown-first
invariant or over-complicating the renderer.

## Load-bearing question — where "checked" lives

Three options. Pick one before discussing format.

### A. Materialise into the day file (recommended)

On first open of a new week / month, append the relevant defaults
into `YYYY-MM-DD.md` under their categories. After insertion they
are ordinary tasks: drag, check, edit, delete behave normally.
Idempotency is guarded by a marker comment in the day file.

- Pro: respects "files are source of truth". No second renderer.
  Obsidian sees plain tasks. Round-trip stays clean.
- Con: one write on first open per period. Need an "already
  inserted?" check.

### B. Synthetic render above each day

Template file holds the tasks; app renders them above each day
column; completion stored in the template via a period marker
(`<!-- done:2026-W19 -->`). No writes to day files.

- Pro: zero day-file churn.
- Con: parallel source of truth, fuzzier "where is this task",
  more UI code paths.

### C. App-state-only completion

Rejected. Violates the markdown-first invariant.

**Decision: A.** Falls back to ordinary task semantics after
insertion; the only new code is the inserter and the marker.

## Format — `Daily/Defaults.md`

Reuses existing parser conventions plus one new layer (H2 for
category nested under H1 cadence). H1 vocabulary is a closed set;
anything else is ignored.

```markdown
# Weekly
## PP
- [ ] instagram user story

# Monthly Start
## Dev
- [ ] Digital Ocean updates

# Monthly End
## Dev
- [ ] Invoice
```

Closed cadence set:

- `Weekly` — inserted on the first opened day of an ISO week.
- `Monthly Start` — inserted on the first opened day of the
  calendar month.
- `Monthly End` — inserted on the first opened day of the last
  ISO week of the month.

Category (H2) maps to the day file's H1 category. If the target
day has no matching category, the inserter creates the H1 at the
end of the file before appending the task.

Tasks under cadence headings follow the existing task grammar
exactly (`- [ ] **title** 1h`, optional star, optional duration,
indented children).

### Why not the alternatives

- Tag suffix in `Backlog.md` (`- [ ] foo #weekly`): pollutes
  Backlog with non-actionable templates; tag typos are silent.
- Single H1 in Backlog (`# Defaults / Weekly :: PP`): H1 doing
  two jobs via a separator string. Ugly, brittle.
- Obsidian block refs (`^weekly-pp`): opaque to a human reader,
  larger parser change.
- User-proposed `===` / `---- Start` fences: non-standard, renders
  oddly in Obsidian, requires a bespoke parser pass.

## Inserter behaviour

```ts
/**
 * Ensure the day file contains the defaults for its period.
 *
 * Idempotent: presence of `<!-- defaults: <key> -->` for a given
 * period key skips that period's insertion. Multiple cadences can
 * apply to the same day (e.g. Monday of month 1 → Weekly + Monthly
 * Start). Each writes its own marker.
 *
 * @param dayFile   - parsed day file contents
 * @param defaults  - parsed `Daily/Defaults.md`
 * @param date      - ISO date of the day file
 * @returns mutated day-file text, or original if no work to do
 */
function applyDefaults(dayFile: string, defaults: Defaults, date: string): string
```

Period keys written into the marker:

- Weekly → `weekly:YYYY-Www` (ISO week, e.g. `weekly:2026-W19`)
- Monthly Start → `monthly-start:YYYY-MM`
- Monthly End → `monthly-end:YYYY-MM`

Insertion point: end of the matching H1 category block, before any
trailing blank lines. New H1 sections are appended at end-of-file
with a leading blank line.

Marker lines live on their own line, immediately above the inserted
group, so a parser that ignores HTML comments sees nothing unusual:

```markdown
# PP
- [ ] existing task

<!-- defaults: weekly:2026-W19 -->
- [ ] instagram user story
```

## Parser changes

- Extend `parseFile` (or add a sibling `parseDefaults`) to walk
  `# H1` → `## H2` → tasks, returning a typed `Defaults` value.
- Day-file parser unchanged. Marker comments fall under the
  existing "preserve unknown lines" rule.
- Add an HTML-comment-skip in the writer's category resolver so
  the marker is not treated as a task line.

```ts
type Defaults = {
  weekly:        Record<string, Task[]>;  // keyed by category
  monthlyStart:  Record<string, Task[]>;
  monthlyEnd:    Record<string, Task[]>;
};
```

## UI — minimal

No new component. Inserted tasks render identically to authored
tasks. If a visual cue is required later, detect the marker block
on parse and tag those tasks with `source: 'default'` for an
optional subtle prefix glyph. Out of scope for v1.

## Trigger point

`applyDefaults` runs on:

1. First load of a day column in the current session.
2. After a Backlog edit that lands on the day (no-op if markers
   present).

Not on Obsidian-side edits — those are picked up on next focus, at
which point the inserter is idempotent.

## Edge cases

- User deletes a default task in the day file: stays deleted. The
  marker prevents re-insertion in the same period.
- User edits `Defaults.md` mid-week: already-inserted days are not
  retro-updated. New days in the same week get the updated set.
- Week / month boundary days: both cadences fire; each writes its
  own marker.
- ISO week vs locale week: use ISO (`YYYY-Www`) consistently to
  match the rest of the codebase's date handling.
- No `Daily/Defaults.md` present: inserter is a no-op.

## Tests

Unit (`src/lib/md/defaults.test.ts`):

- Parse `Defaults.md` into typed cadence groups.
- `applyDefaults` is idempotent: running twice on the same input
  yields identical output.
- Insertion creates missing H1 categories at end-of-file.
- Marker keys are correct for ISO week / month-start / month-end
  boundary days.
- Round-trip: `parseFile(applyDefaults(...))` returns the original
  tasks plus the new defaults in order.

Manual:

- Open a Monday → weekly defaults appear under their categories.
- Check one, reopen Monday → still checked, no duplicates.
- Open Tuesday → no re-insertion.
- Edit `Defaults.md` and open Wednesday → no change to existing
  days, change applies from next week.

## Out of scope (v1)

- Daily / quarterly cadences.
- Per-weekday weekly tasks ("Mondays only").
- A picker UI inside the app for editing defaults — edit the file
  in Obsidian.
- Visual distinction between authored and default tasks.

## File changes (outline)

- `src/lib/md/defaults.ts` — parse + apply.
- `src/lib/md/defaults.test.ts` — unit tests.
- `src/lib/state.svelte.ts` — call `applyDefaults` on day load.
- `docs/6--usr--default-tasks.md` — user-side checkboxes track
  acceptance.

## Commit plan

Atomic, conventional commits:

1. `feat(md): parse Daily/Defaults.md` — parser + types + tests.
2. `feat(md): apply defaults to day files` — inserter + markers
   + tests.
3. `feat(day): wire defaults inserter into day load` — state
   integration.
4. `docs: changelog + readme for default tasks`.

Pause for testing between (2) and (3); the parser/inserter must be
green and idempotent before touching state.
