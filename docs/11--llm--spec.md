# 11 — Past-day visual distinction, backlog darkening & backlog completion fixes

## Status: Part A done, Part B deferred, bug fixes shipped

### Shipped
- **Part A** — Visual distinction for past days and backlog (darker backgrounds, dimmed headers)
- **Bug fix** — Long-press on backlog tasks now correctly moves them to today
- **Bug fix** — Checkbox completion of done backlog tasks handled explicitly
- **Clear cache & reload** button added to InfoDrawer Options tab

### Deferred
- **Part B** — Roll week to backlog (manual button for past weeks)
- **Part C** — Auto-roll prompt on new week detection

---

## Phase 1: Step-Back Analysis

### Problem Classification

Two related problems:

1. **Visual distinction (CSS/UI design):** Past day columns currently have `class:past` applied but zero CSS rules. They look identical to today and future days. The user needs a clear, immediate signal that a column represents a day that has already passed — it should feel "archived" or "read-only" rather than part of the active workflow.

2. **Task lifecycle / roll-forward (state management + file I/O):** Currently, unfinished tasks from past days appear in the BacklogRail's "Overdue" section but remain in their original past-day files. The user wants a deliberate end-of-week action that moves all unfinished tasks from a completed week into `Backlog.md`. This is already partially supported by the existing `rollAll()` function in `BacklogRail.svelte` — but that rolls overdue + backlog tasks forward to *today*. The new behavior moves only the *past week's* unfinished tasks into the *backlog*.

### Governing Principles

- **Affordance:** Past days must look visually inactive so the user doesn't mistakenly interact with them as if they're current. Color/brightness is the primary signal.
- **Explicit user action:** The roll should be a deliberate manual action, not automatic. The app has no background process or cron — automatic roll would mean silently moving tasks on first refresh of a new week, which violates user trust. A "Roll week" button gives the user control.
- **Idempotency:** The roll operation must be safe to trigger multiple times (no duplicates). Since tasks are *moved* (delete from source), re-running on an already-rolled week is a no-op.
- **Line-preserving serialization:** `moveTask()` already handles this — tasks are written to target verbatim and the source lines are spliced out. No reformatting occurs.
- **Atomic cross-file moves:** The existing `moveTask()` writes target first, removes from source, and rolls back target on source failure. The batch roll reuses this per-task.

### Data Structures & Complexity

- Batch roll is O(n) where n = total tasks across 7 daily files. Each individual `moveTask()` is already atomic.
- No new data structures needed. The roll reuses `moveTask()`, `readFile()`, and `parseFile()`.
- Visual distinction is pure CSS — O(1) rendering impact.

---

## Phase 2: Edge Cases & Architecture

### Edge Cases

1. **Partial week (current week):** The roll button must only target weeks where all 7 days are in the past. A week containing today or future days is ineligible.

2. **Missing day files:** Weekend days may not have `.md` files. `readFile()` returns `null` for missing files — skip them gracefully.

3. **Defaults-inserted tasks rolled:** Tasks auto-created from `Defaults.md` (e.g., weekly recurring) have `fromDefaults: true`. If the user rolls a past week, these should be included in the roll — they're real tasks the user may have worked on. The `fromDefaults` flag only excludes them from the "Overdue" display, not from file operations.

4. **Conflict files in the week:** The roll should skip `(conflict copy).md` files — only operate on standard `YYYY-MM-DD.md` daily files.

5. **Large backlog with duplicate categories:** `appendTask()` already handles this — it finds the matching H1 section and appends under it. No duplicate category headers are created.

### Architectural Pattern

**Command pattern** for the batch roll — encapsulate the multi-step operation (iterate week → move each task) in a single exported action `rollWeekToBacklog()`. The UI triggers it via a button; the action handles all I/O and cache invalidation.

---

## Phase 3: Implementation Plan

### Part A: Visual distinction for past days (XS, ~30min) — DONE

**Approach:** Darken past-day column surfaces and reduce overall contrast. Past days feel "archived" — still readable and editable, but clearly not part of the active workflow.

CSS added to `DayColumn.svelte`:

```css
.day-col.past {
  background: #e0e0e0;
}
.day-col.past .day-head {
  opacity: 0.5;
}
.day-col.past .task-list {
  background-color: #d4d4d4;
}
.day-col.past :global(.task-item) {
  background: #eaeaea;
  border-color: #d0d0d0;
}
.day-col.past :global(.task-item.done) {
  opacity: 0.35;
}
```

| Element | Before | After |
|---------|--------|-------|
| Column bg | `#fff` (same as future) | `#e0e0e0` |
| Day header | full opacity | 50% opacity |
| Dot-grid | `#e8e8e8` | `#d4d4d4` |
| Task cards | `#fff` | `#eaeaea` |
| Done tasks | 55% opacity | 35% opacity |

Tasks remain fully interactive (checkboxes, drag, edit, double-click).

### Part B: Roll week to backlog (M, ~2–3h)

**New action in `src/lib/state.svelte.ts`:**

```typescript
/**
 * Move all unfinished (non-done) tasks from a completed past week into Backlog.md.
 * Only operates on weeks where all 7 days are strictly in the past.
 * Each task preserves its category and status. Tasks already done are left in
 * their original day files.
 *
 * @param weekOffset - Week offset from current week (-1 = last week, -2 = two weeks ago).
 *                     Must be negative (past weeks only).
 * @returns The number of tasks rolled.
 */
export async function rollWeekToBacklog(weekOffset: number): Promise<number>
```

**Algorithm:**
1. Compute the 7 ISO dates for `weekOffset` via `getWeekDays(weekOffset)`
2. Guard: if any day is not `past`, refuse with an error toast
3. For each day file, read and parse it
4. Collect all non-done tasks across the week
5. Sequentially `moveTask(task, 'Backlog.md')` for each
6. Refresh caches for all affected files
7. Return the count of tasks moved

**UI trigger in `+page.svelte`:**

A button in the topbar, visible only when:
- The current view is a past week (all 7 days are past), AND
- At least one day in that week has unfinished tasks

Button label: "Roll week to backlog"

**Behavior after roll:**
- The past week columns become empty (or retain only done tasks)
- Tasks appear in Backlog.md under their original category headers
- A toast confirms: "Rolled N tasks to backlog"

### Part C: Optional auto-roll (deferred assessment)

After Parts A and B are implemented and tested, assess whether an automatic prompt on new-week detection adds value. The trigger would be: on first refresh of a new week, if the previous week has unfinished tasks, show a one-time banner: "Last week has 5 unfinished tasks. Roll to backlog?" with "Roll" and "Dismiss" buttons.

**Decision deferred** until Part B is in use.

---

## Tasks

### A — Visual distinction (done)

- [x] Add `.past` CSS rules in `DayColumn.svelte` style block
- [ ] Verify tasks remain interactive (checkboxes, drag, edit, double-click)
- [ ] Test with `hidePast` toggle — ensure past days look correct when revealed

### B — Roll week to backlog

- [ ] Add `rollWeekToBacklog(weekOffset)` action to `state.svelte.ts`
- [ ] Guard: only allow negative offsets (past weeks), all days must be past
- [ ] Iterate all 7 day files, collect non-done tasks, move each via `moveTask()`
- [ ] Return count and show toast
- [ ] Add "Roll week to backlog" button to topbar in `+page.svelte`
- [ ] Button visibility: only when viewing a fully-past week with unfinished tasks
- [ ] Write unit tests for the roll logic (mocked FS)
- [ ] Run `pnpm check` and `pnpm test:unit`

### C — Spec updates

- [ ] Update `docs/11--llm--status.md` on completion
- [ ] Add changelog entry
- [ ] Commit with conventional commit message

---

## Why This Honors the Step-Back Analysis

The visual distinction uses brightness as the primary affordance signal (darker = further away = past), following the design principle that closer elements should be lighter — past days recede into the background while remaining accessible. The roll operation uses the **command pattern** to encapsulate a multi-file batch mutation behind a single explicit user action, reusing the existing atomic `moveTask()` infrastructure so every task move is individually safe and idempotent.
