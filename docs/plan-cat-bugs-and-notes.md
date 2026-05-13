# Plan — category bugs + free-form notes

Scope: fix the cluster of category bugs in backlog + week, add missing
backlog-row affordances (edit, delete), and add a free-form notes popover
attached to each daily file under a `---` divider.

Pause for testing/approval after each step. Pair mode by default.

---

## Root cause (one line)

The cache models tasks but not the **shape** of each file. Empty H1s and
"before the first H1" don't exist anywhere in state, so every cat bug is
a downstream consequence.

## Bugs to fix

| # | Where    | Symptom                                                   | Cause                                                           |
|---|----------|-----------------------------------------------------------|-----------------------------------------------------------------|
| 1 | Backlog  | Can't drag task to a different category                   | BacklogRail has only a whole-rail drop zone; no per-section.    |
| 2 | Backlog  | New-task form omits cats that have no tasks               | `categories` is derived from tasks, not from file headers.      |
| 3 | Backlog  | New task with "no category" lands inside a category       | `appendTask(_, _, null)` inserts at EOF, below trailing H1s.    |
| 4 | Backlog  | No delete on backlog rows                                 | BacklogRail's inline snippet never wired a delete control.      |
| 5 | Backlog  | Can't edit backlog tasks                                  | Same — no dblclick→edit on the inline snippet.                  |
| 6 | Week     | "Add category" appears to do nothing                      | DayColumn `sections` is task-derived; daily files have no       |
|   |          |                                                           | header registry equivalent to `appState.backlogHeaders`.        |

## Feature to add

- **Daily notes popover** — every daily file gains an optional free-form
  notes section after a `---` horizontal rule. Click a "notes" button in
  the day-column footer to open a popover; edit in a textarea; save writes
  the block back beneath `---`. Parser must round-trip unknown lines (it
  already does), so the notes block is preserved byte-identical when not
  edited.

---

## Step 1 — lift file headers into state

**Files:** `src/lib/state.svelte.ts`

- Add `fileHeaders: Record<string, string[]>` to `AppState`.
- In `refresh()`, populate `fileHeaders[name]` by reusing `extractH1s()`
  on every file's raw text (not just `Backlog.md`).
- After every write that touches H1s (`addCategoryToFile`,
  `deleteCategoryFromFile`, `addTask`, `moveTask`,
  `moveToCategoryInFile`, `deleteTask`), refresh that file's
  `fileHeaders[filename]` entry from the new content.
- Keep `backlogHeaders` as a thin alias (`fileHeaders['Backlog.md'] ?? []`)
  to avoid churn in BacklogRail, or migrate that one call site.

**Test:** unit test that after `addCategoryToFile('2026-05-13.md', 'Work')`
the file content contains `# Work` and `appState.fileHeaders['2026-05-13.md']`
includes `'Work'`.

**Commit:** `feat(state): per-file H1 header registry`

---

## Step 2 — fix `appendTask` "no category" semantics

**Files:** `src/lib/md/serialize.ts`, `src/lib/md/serialize.test.ts`

- When `category === null`, insert the line **before the first H1** in the
  file, not at EOF. If no H1 exists, fall back to current EOF behaviour.
- Add a round-trip test: file with `# Work\n- [ ] a\n`, append null-cat
  task → parsed task has `category === null`.

**Commit:** `fix(serialize): no-cat tasks go above first H1, not below last`

---

## Step 3 — BacklogRail: use file headers + add per-section drop

**Files:** `src/lib/components/BacklogRail.svelte`

- Replace the task-derived `categories` derivation with
  `appState.backlogHeaders` (full list, ordered as in file).
- Make each `.section-head` a drop target. On drop, call
  `moveToCategoryInFile(externalDragTask, section.category)` when the
  dragged task is from `Backlog.md`, else `moveTask` first.
- Add a "no-category" implicit section at the top so users can drop a
  task back to uncategorised. Render it without a header label.

**Test (manual):** create a `# Foo` with no tasks → "Foo" appears in
add-task dropdown. Drag an existing backlog task onto the `# Foo` head →
task moves under `# Foo` in the file.

**Commit:** `fix(backlog): show empty cats in picker + per-section drop`

---

## Step 4 — BacklogRail row affordances (edit, delete)

**Files:** `src/lib/components/BacklogRail.svelte`

Simplest path: replace the inline `taskItem` snippet with `<TaskRow {task} />`.
TaskRow already wires star, dblclick→edit, delete, sub-badge. Verify the
backlog-rail visual style still reads correctly; tighten styles if needed,
but don't fork behaviour.

If TaskRow's day-column visuals look wrong in the narrow rail, instead
copy its edit + delete blocks into the inline snippet — but a single
component is the lower-maintenance option.

**Test (manual):** double-click a backlog task title → edit. `x` button
→ confirm → row gone from file.

**Commit:** `feat(backlog): edit + delete on backlog rows via TaskRow`

---

## Step 5 — DayColumn: render empty cat heads + per-section drop

**Files:** `src/lib/components/DayColumn.svelte`

- Mirror BacklogRail's `backlogSections` pattern: overlay
  `appState.fileHeaders[day.iso + '.md']` so H1s with no tasks render.
- Make each `.section-head` a drop target (same handler shape as the
  per-row drop target, but `to` is the section, not a specific index).

**Test (manual):** click `# cat` in a day footer → name "Foo" → Enter →
"Foo" appears as a section divider with no tasks under it. Drag a task
onto that head → task lands under `# Foo` in the file.

**Commit:** `fix(week): show empty cat heads + drop-on-section`

---

## Step 6 — Free-form notes popover

**Files (new + edits):**

- `src/lib/md/notes.ts` (new) — small module with:
  - `extractNotes(content: string): string` — text after the first
    standalone `---` line, or `''`.
  - `setNotes(content: string, notes: string): string` — replace block
    below `---`. If no `---` exists and `notes` is non-empty, append
    `\n---\n${notes}\n`.
- `src/lib/state.svelte.ts` — `notesFor(filename)` getter and
  `saveNotes(filename, text)` writer. Notes cached per file alongside
  tasks; re-read on every `refresh()`.
- `src/lib/components/NotesPopover.svelte` (new) — absolutely-positioned
  panel anchored to its trigger; `<textarea bind:value>`; save on blur
  and on Cmd+Enter; Esc cancels. ~80 lines.
- `src/lib/components/DayColumn.svelte` — add a "notes" button to
  `.footer-btns`. Show a small indicator dot when the file has non-empty
  notes. Open `NotesPopover` on click.

**Format on disk:**

```
# Work
- [ ] thing

---
free-form notes go here, multi-line.
links, ideas, etc.
```

**Round-trip:** parser already ignores non-task lines, so notes survive
existing writes. Add a unit test: file with tasks + `---` + notes →
toggle a task done → diff of pre/post is exactly the one checkbox flip,
notes untouched.

**Test (manual):**
1. Open today's column → click "notes" → type → blur → file on disk has
   `---` block.
2. Reopen → text persists. Toggle a task → notes untouched.
3. Empty the notes → file's `---` block is removed (or left empty —
   decide; I'd lean "leave the `---` if user typed one, strip if we
   added it"). Confirm with you before locking the behaviour.

**Commit:** `feat(notes): free-form notes popover per daily file`

---

## Tests to add along the way

- `src/lib/md/serialize.test.ts` — null-cat append placement.
- `src/lib/md/notes.test.ts` — extract/set round-trip; idempotency;
  preservation when other parts of the file change.
- One Playwright smoke: open a day, add cat, drop task onto it, write
  a note, reload, everything still there. (Hits the whole pipeline.)

## Risk notes

- **Data:** all edits go through `writeFile` against the user's chosen
  folder. Before Step 6, confirm a one-shot manual backup of `MasterAlf/`
  so the new notes-write code can't silently corrupt a file we mis-parse.
- **Drop targets:** adding per-section drops will overlap with per-row
  drops in DayColumn. Use `e.stopPropagation()` correctly so a drop on a
  section head doesn't also fire the row-zero drop.
- **TaskRow in BacklogRail (Step 4):** if width or color cues clash,
  prefer a focused style tweak inside TaskRow gated on a `compact` prop
  rather than forking the component.

## Sequencing

1, 2 are pure plumbing — no UI risk. Land first.
3, 4, 5 are independent UI fixes; any order.
6 last — biggest surface area, easiest to back out.

## Iteration

**Notes `---` cleanup rule (Step 6):** leave `---` if it existed in the file before the user ever opened the notes popover; strip it if we added it. Implementation: `refresh()` sets a `hadDividerOnLoad: boolean` per file in state; `setNotes()` receives that flag and decides whether to keep or remove the divider when notes are cleared.
