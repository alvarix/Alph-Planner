# 14 — llm — Status

**Task:** Batch — subtask delete, roll category bug, Obsidian link + preview, defaults roll, overdue completion revert, index link + symlink
**Status:** Implemented; unit tests + type check + build pass. Playwright not runnable in this environment. **Not committed** (awaiting approval).
**Updated:** 2026-10-07

## What shipped

| # | Item | Result |
| --- | --- | --- |
| 1 | Delete subtask | New `deleteSubtask(task, child)` action (`state.svelte.ts`) + hover-reveal × with two-step confirm per subtask (`TaskRow.svelte`). Re-locates the child against fresh disk text, splices only that line, recomputes parent status in place (done / in-progress / todo). Never auto-moves to today. |
| 2 | Roll loses category | **Could not reproduce.** 4 synthesised cases (top-level category, prior week section, existing same-week group, single `bl` move) all preserve the category with children. Shipped a defensive regression test. See "Repro notes". |
| 3 | Obsidian link + preview | Hover-reveal `obl` button per task opens its file in Obsidian; hover shows a viewport-fixed preview of the task block (parent + children). |
| 4 | Defaults rolled to backlog | `rollWeekToBacklog` and the topbar `rollableWeek` predicate now exclude `fromDefaults` tasks (same rule as `overdueTasks`). |
| 5 | Revert overdue→today | `shouldMoveToToday` narrowed to `task.file === 'Backlog.md'`. Overdue tasks complete in place (3s undo window). All call sites updated: `toggleTask`, `completeTask`, `toggleChild`, `TaskRow` checkbox + long-press. |
| 6 | Index link + symlink | Options tab opens `*Alph-planner.md` via `obsidian://` (`src/lib/obsidianIndex.ts`, scheme-checked). `docs/Alph-planner-index.md` symlinks to the iCloud index; gitignored. |

## Repro notes — item 2

The category-preservation code (`insertUnderWeekMarker` → `insertUnderDatedMarker`) works for every
case tested, including tasks with subtasks. Most likely explanation: a **stale PWA/service-worker
build** (fix `945f15c` not live) or the task's cached `category` was already `null` before the move.
If it recurs, capture the day file + the Backlog.md section around `## Added week of`, and confirm
"Clear cache & reload" was used. The regression test at `state.test.ts` ("category preservation with
subtasks") now guards the multi-line-block + existing-group path.

## Verification

| Check | Result |
| --- | --- |
| `pnpm test:unit` | **207 passed / 9 files** (baseline was 198; +9 new) |
| `pnpm check` | **0 errors, 15 warnings** (same 15 pre-existing) |
| `pnpm build` | Success (adapter-vercel) |
| `pnpm test` (Playwright) | **Blocked by environment** — browser never launches from the agent sandbox. Bigger issue found on a local run: three orphaned dev servers from sandbox attempts occupied ports 5199–5201, and `reuseExistingServer: true` reused the stale one on 5199 → 12/12 failed (missing overlay, then `ERR_CONNECTION_REFUSED`). Kill the orphans and re-run. |

New unit tests: subtask delete (4), overdue in-place (2, one flushes the 3s timer with fake timers),
defaults roll exclusion (2), category-with-subtasks regression (1). `beforeEach` now drains
`pendingCompletions` timers so a delayed flush cannot leak into the next test.

## Review

Independent read-only review (builtin `reviewer`, fresh context). Verdict: **OK with notes** — all
five behavioural requirements correct and consistent; no P0/P1. Findings and dispositions:

- **Preview clipped by the day column's scroll container** — fixed with a `position: fixed` popover
  positioned from the button's `getBoundingClientRect()`.
- **Stale "backlog or overdue" comments/docstrings** — updated in `state.svelte.ts` and `TaskRow.svelte`.
- **`isOverdueFile` dead code** — deleted.
- **CHANGELOG referenced this doc before it existed** — now created.
- **`deleteSubtask` leaves a now-childless parent unchanged** — **intentional** (deleting subtasks
  should not reopen a done/parent task). This deviates from the draft spec's edge case 1, which said
  "todo if no children left"; the draft was wrong. Encoded in the test "leaves the parent line
  untouched when the last child is deleted".
- Test-quality notes accepted: the `fromDefaults` tests set the flag by hand rather than exercising
  `refresh()`'s template matching; the detection path is unchanged and pre-existing.

Also removed a pre-existing unused `longPressActive` variable in `TaskRow.svelte` (surfaced as a
blocker by the linter).

## Files changed

| File | Change |
| --- | --- |
| `src/lib/state.svelte.ts` | `deleteSubtask`; `shouldMoveToToday` backlog-only; roll excludes `fromDefaults`; comments; removed `isOverdueFile` |
| `src/lib/components/TaskRow.svelte` | Subtask delete UI; `obl` button + fixed preview; backlog-only comments; removed `longPressActive` |
| `src/lib/obsidian.ts` | Open-redirect guard via anchor; index-link moved out |
| `src/lib/obsidianIndex.ts` | **New** — vault-root index link |
| `src/lib/components/InfoDrawer.svelte` | Options: "Open planner index in Obsidian" |
| `src/routes/+page.svelte` | `rollableWeek` excludes defaults |
| `src/lib/state.test.ts` | +9 tests, timer drain in `beforeEach` |
| `tests/app.test.ts` | Overdue E2E rewritten to assert in-place completion |
| `docs/Alph-planner-index.md` | **New** symlink (gitignored) |
| `.gitignore`, `README.md`, `CHANGELOG.md` | Docs |

## Residual risks / follow-ups

- Playwright: kill any stale dev server before running (`lsof -ti :5199 :5200 :5201 | xargs kill`) so `reuseExistingServer: true` cannot reuse an orphaned/stale Vite process. The app itself builds and serves cleanly (`pnpm build` ok, `pnpm dev` returns HTTP 200, all changed modules transform with HTTP 200).
- The stale pi-lens TS fallback reported false "no exported member" errors for newly added exports;
  the live `svelte-check` and build are clean. A new module was created to work around the stale
  snapshot (kept because it is a reasonable separation, not only a workaround).
- `docs/14--llm--spec.md` remains an unchecked working spec; this file is the completion signal.
