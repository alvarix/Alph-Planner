# Markdown-first rewrite — plan

Rewrite of Alph-Planner where the user's daily MD files in
`MasterAlf/` are the single source of truth. The app is a renderer
and editor over those files. No internal task/session/done arrays.

## Locked decisions

- Stack: SvelteKit PWA (kept from current app)
- File access: File System Access API (Chromium browsers)
- View: column per day, drag to reorder within a day, no clock times
- Priority: bold title = starred (Obsidian-friendly, renders in outline)
- Daily MD files replace the weekly plan file
- Branch strategy: new branch `markdown-first` off `main`. Tag current
  `main` as `v0-grid-archive` first so the time-slot version is
  recoverable. Same Vercel project, same repo, same deploy URL.

## Open decisions — resolved

- Daily filename: **`YYYY-MM-DD.md`** (ISO). Decided.
- Backlog: **`Daily/Backlog.md`** — a single dedicated file in the
  same folder the app already has a handle to. Free-form `- [ ]` lines,
  no date header. App reads it for the left rail; writes back on
  drag-to-column or "Roll all". User writes to it in Obsidian as the
  running todo list (replaces top-of-weekly-note workflow). Decided.

## File format

```markdown
# Work
- [ ] **fix tax return** 1h
  - [x] call mike
  - [ ] call IRS
- [x] alph-planner 30m

# Personal
- [ ] groceries
```

Rules:
- Date comes from the filename (`YYYY-MM-DD.md`). No H1 date header.
- H1 = category/section. Optional. Tasks before any H1 are uncategorized.
  Categories render as subtle dividers in the day column.
- Top-level `- [ ]` / `- [x]` = a task. Order in file = order in column.
- Indented children = subtasks/notes. Move with parent. Don't render in
  week columns by default; expand on click.
- `**bold title**` = starred (priority).
- Trailing duration token (`30m`, `1h`, `1.5h`) = optional estimate.
  Reuses existing `parser.ts` duration grammar.
- No `xN` session count. One task = one line. Multi-day work = put it in
  multiple files.
- No `pN` priority. Star or no star.
- `Backlog.md` follows the same format. H1 categories work there too
  (e.g. `# Work`, `# Someday`).

Writing back to file:
- Preserve all unknown lines verbatim (frontmatter, free text between
  tasks, blank lines). Only mutate the matched task line.
- Round-trip test: parse → serialize → diff must be empty.

## Data model (in-memory, derived only)

```ts
type Task = {
  file: string;          // "2026-05-05.md" or "Backlog.md"
  date: string | null;   // "2026-05-05" or null for Backlog
  lineRange: [number, number]; // for write-back
  category: string | null; // H1 section name, or null if before any H1
  title: string;
  starred: boolean;
  estimateMin: number | null;
  done: boolean;
  children: ChildTask[]; // subtasks
  raw: string;           // original line, for round-trip
};
```

State held in memory is a cache of parsed files. Source of truth is
disk. Cache invalidates on focus and on every write.

## App structure

```
src/
  lib/
    fs/
      folder.ts        # FS Access API: pick folder, persist handle
      files.ts         # read/write/list MD files
      handle-store.ts  # IndexedDB for the directory handle
    md/
      parse.ts         # MD → Task[]
      serialize.ts     # Task[] (mutated) → MD, preserving unknown lines
    state.svelte.ts    # in-memory cache + actions (refresh, edit)
    dates.ts           # KEPT from existing
    parser.ts          # KEPT — used for duration token only
  routes/
    +page.svelte       # week view
  lib/components/
    DayColumn.svelte
    TaskRow.svelte
    OverdueRail.svelte
    NewTaskInput.svelte
    FolderPicker.svelte
```

Discarded from current app: `store.svelte.ts`, `scheduler.ts`,
`Unscheduled.svelte`, `WeekGrid.svelte`, `Inbox.svelte`,
`persistence.ts`. Some of their UI patterns will be cribbed into the
new components.

## Views

1. **Week strip.** N columns (default 7, today highlighted). Each
   column reads its date's file. Empty file or missing file = empty
   column. Click "+" → creates the file lazily on first task add.
2. **Overdue rail.** A left rail listing every unchecked top-level task
   from any past-dated file in the folder. Drag → moves the line into
   today's (or another day's) file. "Roll all" button = bulk move to
   today.
3. **Done log.** A toggleable view that lists every `[x]` line across
   the last N days, grouped by date. Free, since the files have it.
4. **New task input.** Same terse syntax as today minus `xN`/`pN`.
   Default target = today, or whichever column is focused. Hotkey `n`.

## Interactions

- Check/uncheck → rewrite the task's line in its file.
- Drag task between days → remove line from source file, append to
  target file. Atomic: write target first, then source. If source
  write fails, rollback by re-adding to source.
- Drag to reorder within a day → rewrite that file with reordered lines.
- Edit title inline → rewrite the line.
- Delete → remove the line from the file.
- Star/unstar → toggle `**` around the title in the line.

## Phases

### Phase 1 — HTML mockup + read-only week view (4h)

Goal: nail the visual design in static HTML before touching SvelteKit,
then render today's real file in the grid and prove the parse loop.

- 1h: **`mockup-md-first.html`** at repo root, following the same
  self-contained convention as the existing `mockup.html` (inline CSS,
  no build step, viewable by opening the file directly in a browser).
  Renders fake content covering every UI state we need to design:
  - Week strip: 7 day columns, today highlighted, prev/next nav.
  - Tasks in columns: plain, starred (bold), with duration suffix,
    checked, with expanded subtasks, with collapsed subtasks indicator.
  - Overdue rail on the left with a few unchecked past tasks and a
    "Roll all" button.
  - New task input pinned at the bottom or top.
  - Empty-day state and hover/drag-target states.
  - Done log toggle (collapsed by default).

  This is the design checkpoint. Iterate on the mockup until it feels
  right *before* writing any Svelte. Cheap to throw away.
- 0.5h: branch off `main`, tag archive, gut current components, scaffold
  new component skeletons matching the mockup's structure.
- 1h: FS Access API folder picker + IndexedDB handle persistence.
- 1h: `md/parse.ts` for the format above + unit tests for round-trip.
- 0.5h: `DayColumn` and `TaskRow` rendering against real parsed files,
  no edit yet. Should visually match the mockup.

Test: open the app, point it at `MasterAlf/`, see today's tasks
rendered to match the mockup. No edits possible yet. Manual round-trip
test: parse a real file, serialize, diff against original — must be
byte-identical.

### Phase 2 — checkbox + reorder (2h)

- 1h: `md/serialize.ts` with line-preserving write-back + tests.
- 0.5h: checkbox toggle wired to write-back.
- 0.5h: drag-to-reorder within a column.

Test: check a box in the app, open the file in Obsidian, see `[x]`.
Reorder, see lines reordered. Unknown lines (free text, blank lines)
must not move.

### Phase 3 — week strip + cross-day drag (2h)

- 1h: render N day columns, week navigation (prev/next).
- 1h: drag task between days. Two-step write with rollback on failure.

Test: drag yesterday's task to tomorrow. Verify both files updated.
Pull network/permissions during the drag (kill the tab mid-write); on
relaunch, no duplicates and no losses.

### Phase 4 — overdue rail (1h)

- Scan all dated files older than today, surface unchecked top-level
  tasks. "Roll forward" = bulk move to today.

Test: with overdue items present, roll forward, verify each line moved
out of its source file and into today's.

### Phase 5 — new task input + star + estimate (1.5h)

- 0.5h: input box, append to focused day's file.
- 0.5h: star toggle (wraps/unwraps `**`).
- 0.5h: estimate edit, daily total in column header.

Test: type `**ship invoice** 1h`, see it appended bold with `1h`.
Click star to unstar, file shows unbolded.

### Phase 6 — done log + polish (1.5h)

- 0.5h: done log view (scan past N days for `[x]` lines).
- 0.5h: refresh-on-focus so external Obsidian edits reflect.
- 0.5h: PWA manifest update, install flow check, error toasts on FS
  failures.

Test: edit a file in Obsidian while the app is open in another tab,
focus the app, see the change without refresh.

**Total: ~12h.**

## Test plan in plain English (per CLAUDE.md)

- **Round-trip test (Phase 1, 2):** the most important test. Parse any
  real file from your `MasterAlf/`, serialize without modification,
  assert the result is byte-identical to the original. If this passes,
  no edit can corrupt your files.
- **Mutation tests (Phase 2):** for each kind of edit (toggle, reorder,
  rename, star, delete), assert that only the targeted line(s) change
  and every other line — including blank lines, comments, frontmatter
  — survives byte-identical.
- **Cross-file move test (Phase 3):** dragging a task simulates source
  + target write. Test the rollback path explicitly: stub the source
  write to fail, assert target reverts.
- **Manual smoke (every phase):** open the app pointed at a copy of
  your real folder (not the live one) and try the day's workflow.

## Risks

- **FS Access API permission UX.** Browser may prompt every reload if
  user activation is missing. Mitigation: stash the directory handle in
  IndexedDB, request permission lazily on first action.
- **iCloud sync conflicts.** If you edit on phone (Obsidian) and on
  laptop (this app) simultaneously, iCloud may produce conflict files
  like `2026-05-05 (alvar's MacBook).md`. Mitigation: detect conflict
  filenames, surface a banner, do not auto-merge.
- **External edits during app session.** App's in-memory cache goes
  stale. Mitigation: refresh on window focus; show a "file changed
  externally" banner if write-back detects a mid-air diff.
- **Subtask semantics drift.** If you start treating subtasks as
  schedulable, the model breaks. Mitigation: keep subtasks as
  notes-only in v1, revisit if the workflow demands it.

## Backup before we start

- Tag: `git tag v0-grid-archive` on current `main`.
- **Folder backup**: copy `MasterAlf/` to `MasterAlf-backup-2026-05-07/`
  before pointing the app at it the first time. The round-trip test
  protects you, but disk-level backup is cheap insurance.

## Iteration

(Updates to this plan during execution go below this line.)

### 2026-05-12

- Mockup `mockup-md-first.html` complete and signed off. Covers all
  Phase 1 UI states: backlog rail with red date tags, 7 day columns,
  today highlight, starred (bold) tasks, subtask color groups, done log
  aligned to grid, drag-and-drop with visual feedback, folder picker.
- Priority model confirmed: bold title = starred only. No p1–p4 pills.
- Subtasks get a colored left bar matching their parent group (5 color
  palette, auto-assigned). Non-subtask tasks get no bar.
- Backlog = `Daily/Backlog.md`. Free-form `- [ ]` lines. Past unchecked
  tasks surface here with a red date tag. Weekly note workflow retired.
- Stack confirmed: SvelteKit PWA, FS Access API, IndexedDB handle,
  pure-TS parser/serializer, iCloud sync, Vercel deploy.

