# 7 — UI tweaks — LLM response spec

Response to `7--usr--ui-tweaks.md`. Three items: backlog DnD (tasks + categories), category folding, hide past days.

## Architecture baseline (verified)

- **Stack**: Svelte 5 + Vite. Markdown is source of truth (FileSystem API). No DB.
- **DnD**: native HTML5 listeners (`ondragstart`/`ondrop`/`ondragover`). `svelte-dnd-action` is in `package.json` but **unused** — don't introduce it unless we have a reason.
- **Task model** (`src/lib/types.ts:10-26`): `file`, `date`, `category` (H1 above the task), `lineRange`, `children[]`. Identical for day tasks and backlog tasks.
- **Order = line order in the file.** No `order`/`position` field. `reorderTasks(filename, from, to)` (`src/lib/md/serialize.ts:72-126`) already handles task moves by splicing markdown blocks. Wired up in `DayColumn.svelte:195`.
- **Categories**: H1 lines (`# Name`). Tasks inherit nearest preceding H1 (`src/lib/md/parse.ts:53-64`). Headers cached separately in `appState.fileHeaders[file]` and `appState.backlogHeaders` (`src/lib/state.svelte.ts:27-29`).
- **Day/Backlog components**: `DayColumn.svelte` (357 lines) and `BacklogRail.svelte` (361 lines) are structurally near-duplicates. Same data, different layout (column vs. rail).
- **Past days**: `WeekDay.past: boolean` already computed; `class:past` already applied in `DayColumn.svelte:116`. No filter UI exists.

## Plan summary

| # | Item | Effort | Risk |
|---|------|--------|------|
| 1 | Backlog task DnD reorder | S (~30 min) | Low — port existing DayColumn logic |
| 2 | Treat backlog == day (unify) | M (~2-3 h) | Medium — refactor; do AFTER #1 lands |
| 3 | Category reorder (DnD on H1s) | M (~2 h) | Medium — needs new serializer fn |
| 4 | Category folding | M (~2 h) | Medium — needs fold-state persistence decision |
| 5 | Hide past days (view toggle) | S (~45 min) | Low — flag + CSS transition |

Total estimate if all five land: ~7-8h. Item 5 fits the user's 2h budget on its own. Recommend gating items 2 + 4 behind separate approval; ship #1, #3, #5 first.

---

## Item 1 — Backlog task reorder

**Scope**: Drag-drop reorder of tasks within the backlog, mirroring existing DayColumn behavior.

**Approach**:
1. In `BacklogRail.svelte`, add `dragOverIndex` reactive state per section (same pattern as `DayColumn.svelte`).
2. On drop, call `reorderTasks('Backlog.md', fromIndex, toIndex)` — the existing serializer already supports any filename.
3. Indexes need to be computed within the full `Backlog.md` task list, not per-category; `reorderTasks` works on whole-file task order.

**Open questions**:
- Cross-category drops inside the backlog: does dropping under a different H1 change the task's category? (Assume **yes**, matching how moving between days works.)

**Tests**: Unit test on `reorderTasks('Backlog.md', …)` if not already covered.

---

## Item 2 — Unify backlog and day as the same object

**Scope**: User wants "backlog should be treated as same type of object as day."

**Interpretation**: The *data model is already unified* (both are `Task[]` grouped by category). What differs is the **component**. Two readings:

- **(a) Light unify**: extract a shared `TaskSection.svelte` and a shared category-grouping helper. Both `DayColumn` and `BacklogRail` consume it. They stay as separate wrappers for layout.
- **(b) Heavy unify**: one component renders either, layout chosen by prop. Risk: backlog rail's horizontal-ish layout vs. day column's vertical layout fight each other.

**Recommendation**: (a). Achieves the user's intent (same functionality everywhere) without forcing layout convergence. Concretely:
- Extract `groupTasksByCategory(tasks, headers)` to `src/lib/md/sections.ts`.
- Extract `TaskSection.svelte` rendering one category's tasks + DnD wiring.
- `DayColumn` and `BacklogRail` shrink to layout shells.

**Defer until** #1 lands and we've confirmed feature parity actually means parity.

---

## Item 3 — Category reorder

**Scope**: Drag a category header to reorder it. Tasks under it move with it.

**Approach**:
1. New serializer: `reorderCategories(filename, fromIndex, toIndex)` in `src/lib/md/serialize.ts`. Operates on H1 blocks (H1 line + everything until the next H1 or end of file/notes divider).
2. New unit tests covering: move first→last, move with empty category, move when notes divider exists.
3. UI: make the H1 element `draggable`, add drop indicators between sections. Distinguish category-drag from task-drag (e.g., via a `data-drag-type` attribute on `dataTransfer`).

**Open questions**:
- What about the notes section at the bottom (after `---`)? Must stay anchored to file end — `reorderCategories` must not move it.
- Empty categories (header present, no tasks) — should still be reorderable.

**Risk**: Easy to corrupt round-trip if H1 block boundary detection is wrong. Round-trip preservation is a hard invariant — write tests first.

---

## Item 4 — Category folding

**Scope**: Collapse/expand a category section. Persist fold state.

**Decision needed — where does fold state live?**

| Option | Pros | Cons |
|--------|------|------|
| **A.** In-memory only (lost on reload) | Trivial | User probably wants persistence |
| **B.** `localStorage` keyed by `file + category` | Easy, no markdown changes | Doesn't sync across machines / sessions if files move |
| **C.** Markdown sentinel on H1 (e.g., `# Name <!--folded-->`) | Single source of truth | Pollutes the file; need parser updates |
| **D.** YAML front-matter block | Clean, extensible (room for view prefs later) | Need front-matter parser; not in codebase yet |

**Recommendation**: **B** for v1. Reassess if user wants cross-device sync.

**Approach (B)**:
1. New module `src/lib/ui/foldState.ts` — `isFolded(file, category)`, `toggleFolded(file, category)`, backed by `localStorage` under one JSON key.
2. Make this a Svelte 5 `$state` rune so toggles re-render.
3. Add a chevron/affordance on category headers. Click toggles; folded sections hide their task list (CSS `display: none` is fine; if animation desired, use `height: auto → 0` transition via Svelte `slide` transition).

**Open questions**:
- Fold state for backlog vs. day categories — same store, different file keys? (Yes — `Backlog.md` is just another filename.)

---

## Item 5 — Hide past days

**Scope**: Toggle to hide past days in the current week. Animate the transition. User caps at 2h.

**Approach**:
1. Add `hidePast: boolean` to topbar view-options (next to existing done-log toggle in `src/routes/+page.svelte:64-86`). Persist to `localStorage`.
2. In `+page.svelte:97-105`, filter `getWeekDays(weekOffset)` by `!day.past || !hidePast`.
3. Animate via Svelte's `flip` (for siblings reflowing) + `slide`/`fade` on the leaving columns. Keep duration short (~180ms) to match existing `.12s` transitions.

**Open questions**:
- "Past" includes today or excludes it? (Assume **excludes** — today is current, not past.)
- When week changes, persist the flag across navigations? (Yes.)

**Cut criteria**: If the FLIP animation fights with the column layout (grid/flex), ship without animation. Toggle is still useful instantly.

---

## Recommended ship order

1. **Item 5** standalone (45 min, clear win, low risk) — ship first.
2. **Item 1** — backlog reorder parity (30 min).
3. **Item 3** — category reorder (2h, new serializer + tests).
4. **Item 4** — folding, only after deciding on persistence (Option B).
5. **Item 2** — unify components last, once we know what the shared surface actually needs.

Each forms an atomic commit. Suggest a `feat(ui):` prefix per CLAUDE.md conventional commit guidance.

## Decisions (answered 2026-05-16)

1. Cross-category drops inside backlog — **yes**, dropping under a different H1 changes the task's category.
2. Fold state persistence — **localStorage (Option B)** confirmed.
3. Hide-past-days — "past" **excludes today**. Today is current, not past.
4. Animation — **required**.
5. Ship order — **separate commits, execute all items** in the recommended order.
