# 09 — Colon-Shortcut Category Input — Assessment

Status: assessed, decisions recorded, approach simplified

---

## The Approach: Colon Is Just an Input Shortcut

User types `PP: drawing` in the task input. The input component splits on the first `:` and:

1. If `# PP` doesn't already exist in the file → writes `# PP` header
2. Writes `- [ ] drawing` under `# PP`

After the write, the file has a normal H1 section. The grouping engine, parser, serializer — **nothing changes**. The colon is a one-step convenience that replaces the current two-step flow of "click # cat, type name, then click + task, type title."

---

## What Changes

### New: one state action

`state.svelte.ts`:

```ts
export async function addTaskWithColonCategory(
    filename: string,
    rawInput: string    // e.g. "PP: **drawing** 1h"
): Promise<void> {
    const d = dir();
    if (!d) return;

    const colonIdx = rawInput.indexOf(': ');
    if (colonIdx === -1) {
        // No colon — fall back to normal addTask.
        const line = buildTaskLine(rawInput);
        if (!line) return;
        await addTaskInternal(filename, line, null);
        return;
    }

    const category = rawInput.slice(0, colonIdx).trim();
    const titlePart = rawInput.slice(colonIdx + 2).trim();
    const line = buildTaskLine(titlePart);
    if (!line || !category) return;

    // One atomic write: optionally create H1, then append task.
    let current = (await readFile(d, filename)) ?? NEW_DAILY_TEMPLATE;
    if (!extractH1s(current).includes(category)) {
        current = addCategoryHeader(current, category);
    }
    const updated = appendTask(current, line, category);
    await writeFile(d, filename, updated);
    appState.cache[filename] = parseFile(updated, filename);
    appState.fileHeaders[filename] = extractH1s(updated);
}
```

### Changed: one branch in NewTaskInput

`NewTaskInput.svelte` — the `submit()` function detects `:` and calls `addTaskWithColonCategory` instead of `addTask`. Falls through to existing `addTask` when no colon is present.

### Unchanged

- `parse.ts` — no colon recognition
- `DayColumn.svelte` — no grouping engine change, adjacency still works
- `BacklogRail.svelte` — no change
- `serialize.ts` — `appendTask`, `addCategoryHeader` already handle this exact case
- `state.svelte.ts` edit functions — titles are clean (no prefix to track)

---

## Complexity Budget

| Concern | Approach A (virtual) | Approach C (real H1) |
| --- | --- | --- |
| New modules | 3 (`colonCats`, `sectionGrouper`, `categoryColors`) | 1 (`categoryColors`) |
| Parser changed? | Yes — colon split pipeline | No |
| Grouping engine changed? | Yes — adjacency → Map | No |
| Write-back changed? | Yes — prefix awareness in 3 functions | No |
| Serializer changed? | No | No (uses existing functions) |
| Severance points | Feature flag + grouping reversion + parser reversion | Remove colon branch in input + delete new state function |
| File mutation | None | One H1 header per new category |
| Risks | Grouping correctness, section reorder UX | Duplicate H1s (mitigated by `extractH1s` check) |

---

## Edge Cases

| Input | Behavior |
| --- | --- |
| `PP: drawing` | Creates `# PP` if absent, adds `- [ ] drawing` under it |
| `PP: **drawing** 1h` | Starred + duration preserved; `- [ ] **drawing** 1h` |
| `PP: drawing` (category exists) | No duplicate H1; task appended to existing section |
| `drawing` (no colon) | Normal flow — uncategorized task, same as today |
| `: drawing` (empty prefix) | Falls through to normal addTask (colon at position 0 = no category) |
| `PP:` (no title) | No task created (empty title after colon) |
| `Review: Q3 budget` | Creates category "Review" — same behavioral caveat as always-on scope |

### Duplicate H1 guard

The `extractH1s(current).includes(category)` check prevents duplicate headers. But it's case-sensitive — `pp` and `PP` are different headers. This is consistent with how Obsidian and the existing parser treat H1s.

---

## Pastel Auto-Color Coordination

Unchanged from previous spec. `lib/ui/categoryColors.svelte.ts` — one new module, imported by `TaskSection.svelte`. Cross-file consistent hash. No dependency on how the category was created (H1 or colon shortcut — they're both H1s now).

---

## In-App Toggle

A `colonCatEnabled` boolean in `localStorage`, toggled from the topbar alongside `hidePast` / `Upcoming`. When off, `NewTaskInput` skips colon detection entirely — every input flows through the existing uncategorized path. Default: on.

```ts
let colonCatEnabled = $state(localStorage.getItem('colonCatEnabled') !== 'false');
$effect(() => { localStorage.setItem('colonCatEnabled', String(colonCatEnabled)); });
```

This makes the feature instantly severable without code changes — user flips the toggle and the input reverts to current behavior. No file cleanup needed (existing H1s remain valid).

## Severability

To remove the feature permanently:

1. In `NewTaskInput.svelte`, delete the `:` detection branch in `submit()` — keep only the existing `addTask` call
2. Delete `addTaskWithCategory` from `state.svelte.ts`
3. Delete `categoryColors.svelte.ts` if pastel colors are also being removed
4. Remove the toggle button and `colonCatEnabled` state from `+page.svelte`

No file data cleanup needed — H1 headers created by the colon shortcut are indistinguishable from manually created ones. They're valid markdown and will persist normally.

---

## Predicted Problems

1. **Colon in existing titles.** Same as before — `Review: Q3 budget` creates a category "Review". With always-on scope, this affects all existing data on first use.

2. **Two writes if user edits a colon-category task title.** The title is clean in the file (`- [ ] drawing` under `# PP`), so `editTaskTitle` works normally. No re-insertion needed.

3. **Category name collisions between days.** Monday has `# PP`, Tuesday also gets `# PP`. Pastel color is consistent (cross-file hash). No conflict — each file is independent.

4. **Backlog compatibility.** Backlog tasks are moved to daily files via `completeBacklogTask` or drag-and-drop. These functions use `appendTask` with `task.category` — which will be the H1-derived category from the backlog. If the target daily file doesn't have that H1 yet, the task goes to the top. The colon shortcut doesn't interact with this flow.

---

## Decisions (2026-07-13, revised)

| Question | Decision | Note |
| --- | --- | --- |
| Approach | **C. Colon → Real H1** | Input shortcut only; file gets a real `# PP` header |
| Scope | Toggleable via localStorage + topbar button | Default on; user can disable to revert to plain input |
| Precedence | N/A | No virtual/faux categories to conflict with H1s |
| UI rendering | Full section heads (H1) | Unchanged from current behavior |
| Color scope | Cross-file consistent | Same hash for same category name everywhere |

---

## Next Steps

- [ ] `09--usr--spec.md` rewritten with simplified task checklist
