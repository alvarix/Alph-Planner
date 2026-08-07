# Bug 02 — Backlog mirror

**Status:** Root cause confirmed; fix pending local verification
**Severity:** Medium — one persisted task is rendered twice, making the UI look as if task state is being copied between files
**Reported:** 2026-08-06

## Symptom

An unfinished task appears both in its daily column and in the backlog rail. Checking either representation also checks or updates the other representation.

The visible duplication suggests that the app copied the task into `Backlog.md`, but the Markdown files may contain only one task line.

## Confirmed primary cause: overdue tasks are rendered twice

The app intentionally derives an `overdue` list from unfinished tasks in past-dated daily files:

```ts
// src/routes/+page.svelte
<BacklogRail
  backlog={backlogTasks()}
  overdue={overdueTasks(todayISO)}
/>
```

`BacklogRail.svelte` renders those tasks in its `Overdue` section. At the same time, `+page.svelte` renders the source daily file in a `DayColumn` when that day is part of the visible week.

The two rows are not independent tasks. They are two UI representations of the same source identity:

```text
(filename, lineRange)
```

Both rows therefore call the same state mutation against the same Markdown line. Checking the daily-column row updates the row in the backlog rail after cache refresh, and checking the backlog-rail row updates the daily-column row. This synchronized behavior is expected for shared identity, but rendering both rows simultaneously is the bug.

### Historical origin

Commit `ac95a2f` introduced the behavior as a feature:

> add BacklogRail with overdue tasks, date tags, and roll-all

Its stated design was to show `Backlog.md` tasks plus unchecked past-day tasks in the backlog rail. The repository notes repeat that decision:

- `docs/llm-notepad.md`: past unchecked tasks from daily files surface in the rail.
- `docs/markdown-first-plan.md`: past unchecked tasks surface in the backlog.
- `docs/postmortem-grid-version.md`: overdue state should be a derived query, not separately stored state.

The derivation is correct, but it lacks a view-level invariant: a task should not be rendered in both the visible day grid and backlog rail at the same time.

## Secondary look-alike: Obsidian backlog transclusion

Commit `027d214` introduced this template for newly created daily files:

```md
![[Backlog]]
```

Obsidian interprets that line as a live embed of `Backlog.md`. A task shown in that embed and in the actual backlog note is intentionally the same checkbox, so checking either display updates the same line in `Backlog.md`.

The Alph-Planner parser correctly ignores `![[Backlog]]`; parser and serializer tests confirm that the embed line is preserved but not parsed as a daily task. Therefore this transclusion does not explain duplicate rows inside Alph-Planner, but it can produce an almost identical symptom inside Obsidian.

## Non-causes ruled out

- **Title collision:** task mutations use the source file and line range rather than title matching.
- **Svelte key collision:** overdue rows are keyed by `task.file + ':' + task.lineRange[0]`.
- **Parser duplication:** `parseFile()` ignores the `![[Backlog]]` embed and parses only real task lines.
- **Duplicate persistence:** the app-level mirror can occur while the task exists in only one daily Markdown file and not in `Backlog.md`.

## Required invariant

Within Alph-Planner, one persisted task identity must appear at most once in the active planning view.

A daily-file task may appear:

- in its visible `DayColumn`, or
- in the backlog rail's derived `Overdue` section when its source day is not visible,

but never in both places simultaneously. Actual `Backlog.md` tasks remain in the backlog rail and are unaffected by this rule.

## Implemented fix

The derived overdue list is filtered against the filenames represented by currently visible day columns before it is passed to `BacklogRail`.

This preserves the overdue feature for tasks whose source day is outside the active grid while removing duplicate representations from the current view. The exclusion follows `visibleDays`, not all seven dates in the selected week, so past days hidden by the `Upcoming` option can still surface as overdue.

Implementation:

- `src/lib/taskSelectors.ts` provides a pure, source-filename selector.
- `src/routes/+page.svelte` derives a `Set` of visible daily filenames and filters overdue tasks through the selector.
- `src/lib/taskSelectors.test.ts` covers visible, hidden, same-title, real-backlog, and empty-view cases.

Target complexity:

- Build a `Set<string>` of visible daily filenames: O(v) time and O(v) space, where `v <= 7`.
- Filter overdue tasks by source filename: O(n) time.
- Preserve source-scoped identity and all existing Markdown write paths.

## Edge cases to verify

1. An unfinished task from yesterday appears only in yesterday's visible column, not also under `Overdue`.
2. Enabling `Upcoming` hides yesterday's column and allows that task to appear under `Overdue`.
3. An unfinished task from a date outside the visible week still appears under `Overdue`.
4. A real task in `Backlog.md` remains visible regardless of the selected week.
5. Two tasks with the same title in different files remain independent.

## Test plan

### Automated

Add coverage for the overdue visibility selector:

- excludes tasks whose source filename is visible;
- retains tasks from non-visible past files;
- never filters actual `Backlog.md` tasks, because those come from `backlogTasks()` rather than `overdueTasks()`;
- handles an empty visible-file set.

Results:

- `pnpm check`: passed with 0 errors (15 pre-existing Svelte warnings).
- `pnpm test:unit`: passed, 139 tests at the time of the full run; the final selector-only run passed all 5 selector tests.
- `pnpm build`: passed.
- `pnpm test`: blocked before application execution because the Playwright Chromium executable is not installed locally.

### Manual

1. Put an unchecked task in yesterday's daily file.
2. Open the current week with past days visible.
3. Confirm the task appears only in yesterday's column.
4. Enable `Upcoming` so yesterday is hidden.
5. Confirm the task now appears once under `Overdue`.
6. Toggle it and confirm only its source daily Markdown line changes.
7. Inspect `Backlog.md` and confirm the task was not copied there.

## Affected code

| File | Role |
| --- | --- |
| `src/routes/+page.svelte` | Combines the visible day grid with the derived overdue list |
| `src/lib/state.svelte.ts` | Provides `overdueTasks(todayISO)` and `backlogTasks()` selectors |
| `src/lib/components/BacklogRail.svelte` | Renders real backlog tasks and derived overdue tasks |
| `src/lib/components/TaskRow.svelte` | Mutates the task's owning file and line range |
| `src/lib/md/parse.ts` | Ignores Obsidian embeds and assigns source identity |
