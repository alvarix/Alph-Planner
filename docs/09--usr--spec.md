# 09 — Colon-Shortcut Category Input + Pastel Colors — Usr Tasks

Status: Phase 1-2 complete, Phase 3 pending

---

## Phase 1: Colon Shortcut in Input

- [x] Add `colonCatEnabled` localStorage toggle in `+page.svelte` (pattern: same as `hidePast`)
- [x] Add toggle button to topbar, visible when folder is ready, default on
- [x] Add colon detection to `NewTaskInput.svelte` — split input on first `:` before calling `buildLine()`; respect toggle
- [x] Create `addTaskWithCategory()` in `state.svelte.ts` — one atomic read + write: optionally create H1, then append task
- [x] Guard against duplicate H1s via `extractH1s(current).includes(category)`
- [x] Extract category name (before `:`) and task title (after `:`)
- [x] Title part flows through existing `buildLine()` for `**starred**` and `1h` duration support
- [x] Falls through to existing `addTask()` when no `:` in input
- [x] Edge: `:` at position 0 → no category, fall through to normal add
- [x] Edge: nothing after `:` → no task created
- [x] `appendTask` and `addCategoryHeader` unit tests still pass (113/113)
- [ ] Unit test: `addTaskWithCategory` creates correct file structure

## Phase 2: Pastel Auto-Colors

- [x] Create `lib/ui/categoryColors.svelte.ts` with `catBg(category, allCats)` and `catText(category, allCats)`
- [x] Hash: djb2 on lowercased name → hue = hash % 360; saturation 40%/35%, lightness 91%/30%
- [x] Collision avoidance: offset hues < 20° apart across active categories
- [x] Apply to `.section-head` in `TaskSection.svelte` via inline `style="--cat-bg: ..."` + CSS `var()` fallbacks
- [x] Cross-file consistent — same hash for "PP" in every file (TaskSection shared by DayColumn + BacklogRail)
- [x] Uncategorized tasks remain monochrome (`var(--cat-bg, var(--bg))` fallback)
- [ ] Accent stripe (2px left border) on `TaskRow.svelte` when task has a category
- [ ] WCAG AA contrast check — manual verification
- [ ] Write unit tests for hash stability and collision avoidance

## Phase 3: Polish

- [x] `pnpm check` — zero type errors
- [x] `pnpm test:unit` — all existing tests pass (113/113)
- [ ] Unit tests for new colon shortcut + color code
- [ ] `pnpm test` (Playwright E2E) — no regressions
- [ ] Manual smoke: type `PP: task 1h`, verify H1 created, task under it
- [ ] Manual smoke: type same `PP: task2` in another day column, verify no duplicate H1
- [ ] Manual smoke: star + duration work with colon prefix
- [ ] Update README with colon shortcut syntax docs
- [ ] Update changelog
