# 14 — llm — Batch plan (response to `14--usr--spec.md`)

## Phase 1 — Step-Back Analysis

**Problem classification.** Mixed batch: (a) a CRUD affordance (delete a child line),
(b) a data-integrity investigation in the week-roll serializer, (c) external-app
interop (Obsidian deep links), (d) a rollover filter bug, (e) a behaviour reversal in
the completion routing rule, (f) a cross-boundary settings link + repo symlink.

**Governing principles.**
- *Line-preserving serializer* — every mutation touches only its target line range and
  passes everything else byte-identical (AGENTS.md, ADR-003).
- *Single routing rule* — completion target is decided in exactly one predicate
  (`shouldMoveToToday`) and enforced again at the state layer.
- *Boundary validation* — external paths (Obsidian vault, index file) are validated at
  the system boundary, never assumed.
- *Configurable behaviour lives at the resolver*, not sprinkled across components.

**Data structures & complexity.**
- Tasks remain `Task[]` in `appState.cache`, parsed per file; mutations are O(file
  lines) splices, unchanged. No new structures.
- `fromDefaults` is already a boolean flag set during `refresh()` — reuse it as the
  roll-filter predicate; O(n) filter.
- Child deletion reuses `relocateChild` (O(lines)) then a single splice — same shape as
  `toggleChild`.

**Named pattern.** *Single-source-of-truth predicate* for completion routing; *adapter*
for Obsidian URL building (`lib/obsidian.ts` already exists).

---

## Phase 2 — Edge cases & architecture

**Edge cases (5).**
1. Deleting the last child: parent status must be recomputed (todo if no children left);
   must not auto-move a backlog parent to today as a side effect.
2. Deleting a child whose line was already edited/deleted externally: `relocateChild`
   returns null → abort with a sync toast, never splice a stale index.
3. Rollover of a default task the user deliberately kept/modified: `fromDefaults` only
   matches the unmodified template line, so a renamed default still rolls (correct).
4. Overdue task completed in place after the revert: `overdueTasks()` must no longer
   re-show it (it becomes `done`, already filtered).
5. Obsidian deep link when vault name is empty or the index file is outside the planner
   folder: fall back to `file://` or hide the button; never open a broken URI.

**Architectural pattern.** *Port-and-adapter* for Obsidian: components call a small
`openIndexInObsidian()` helper; the URL/URI construction is isolated from UI. Completion
routing stays as the single `shouldMoveToToday` predicate plus the state-layer guard.

---

## Phase 3 — Plan

### 1. Delete subtask

- Add `deleteSubtask(task, child)` to `src/lib/state.svelte.ts`: `readFile` →
  `relocateChild` → splice `child.lineIndex` → write → re-parse cache → recompute parent
  status in place (reuse the cascade logic extracted from `toggleChild`, but **no**
  backlog auto-complete-to-today) → `recordChange('−', 'Deleted subtask', …)`.
- UI (`TaskRow.svelte`): hover-reveal small delete control on each subtask row,
  two-step confirm consistent with the task delete (`×` → `del`/`no`).
- Tests: `state.test.ts` — deletes only the child line; parent recomputes
  done/in-progress/todo; last child leaves parent `todo`; stale-child → abort + toast.

### 2. Category lost on roll (mtk "Tenant Deposit", 2026-09-23)

- **Findings:** all synthesised roll paths preserve `category`, including tasks with
  subtasks (top-level `# mtk`, prior week section, existing same-week `# mtk` group,
  single `bl` move). Throwaway tests passed 4/4.
- **Likely causes to confirm with Alvar:** stale PWA/service-worker build (fix not live),
  or the task's cache `category` was already null before the move.
- **Action:** ask for the real day file + Backlog.md section and cache-clear confirmation.
  Keep a permanent regression test for "categorised block *with children* under an
  existing same-week category group". Do **not** change serializer logic without a repro.
  Also audit the rail's "no-category" drop strip, which intentionally nulls category —
  possibly add a toast so a deliberate uncategorisation is not mistaken for a bug.

### 3. Obsidian link (and preview)

- Pending clarification (item 1). Tentative: add per-task/day "open in Obsidian" plus a
  hover preview popover rendering the row's title/markdown; route through
  `lib/obsidian.ts`.
- Keep `openInObsidian(folderName, filename)` as the adapter; add a preview helper that
  does not read files outside the planner folder.

### 4. Uncompleted defaults rolled to backlog

- Exclude `fromDefaults` tasks in `rollWeekToBacklog` collection (mirror
  `overdueTasks`): `t.status !== 'done' && !t.fromDefaults`.
- Update `rollableWeek` in `routes/+page.svelte` to the same predicate so the button
  disappears when only defaults remain.
- Tests: `state.test.ts` — a day with one normal + one `fromDefaults` unfinished task
  rolls only the normal one; roll returns 0 when only defaults remain.
- Data cleanup of the already-rolled defaults in `Backlog.md` is a separate, manual,
  destructive step — propose, do not perform without approval.
- Update CHANGELOG + README (Defaults note: "unfinished recurring tasks are not rolled").

### 5. Revert "past todos checked move to today"

- Pending clarification (item 2). Tentative: narrow `shouldMoveToToday` to
  `task.file === 'Backlog.md'` only (drop `isOverdueFile`). Then overdue tasks complete
  in place, staying dated to their original day.
- Update call sites: `toggleTask`, `completeTask`, `toggleChild`, and `TaskRow.svelte`
  checkbox/long-press branches.
- Tests: rewrite the overdue-completion cases; assert the checkbox writes `[x]` in the
  past file and that today's file is untouched.

### 6. Settings link to the planner index + symlink

- Options tab (`InfoDrawer.svelte`): add "Open planner index in Obsidian" button,
  adapter builds `obsidian://open?vault=…&file=…`; falls back to a `file://` link if no
  vault is set.
- Create `docs/` symlink → `/Users/alvarsirlin/Library/Mobile Documents/iCloud~md~obsidian/Documents/MasterAlf/*Alph-planner.md`
  (exact filename confirmed with Alvar). Decide commit vs `.gitignore` (absolute
  machine-specific link).
- Do not read the target file from the agent (outside workspace) — only link to it.

### Verification

- `pnpm test:unit` (baseline 198 passing) — run after each item.
- `pnpm check` — 0 errors.
- Playwright smoke for new UI controls where practical (Chromium only).
- Update README + CHANGELOG; write `14--llm--status.md` on completion.
- Per AGENTS: each logically complete block gets a commit — **only with approval**.

## Decisions (from chat)

1. **Obsidian link + preview** = per-task open-in-Obsidian button with a hover preview
   of the task block. Shipped in `TaskRow.svelte` (viewport-fixed popover).
2. **Completion revert** = overdue (past-day) only. Backlog tasks still move to today;
   overdue tasks complete in place. `shouldMoveToToday` now returns `task.file === 'Backlog.md'`.
3. **Item 2** = defensive regression test only (could not reproduce).
4. **Symlink** = `docs/Alph-planner-index.md` → the iCloud index note, added to `.gitignore`
   (machine-specific absolute path).

## Outcome

See `docs/14--llm--status.md` for what shipped, verification evidence, and residual risks.
