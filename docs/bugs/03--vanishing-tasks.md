# Bug 03 — Vanishing tasks (data loss class)

**Status:** Fixed (2026-08-07) — root cause confirmed, repro + fix tests added, structured error model + cache reconvergence added, all 176 unit tests pass, build clean. Pending user verification in the live folder.
**Severity:** Critical — user-visible data loss; tasks silently disappear from one or more `.md` files
**First reported:** 2026-08-07
**Class:** Parser/serializer round-trip integrity + stale line-index writes + FS concurrency

## Symptom (as reported)

Working in the live folder, adding and completing tasks. Chronological
timeline of the failure:

1. While **adding** tasks to the backlog, `Backlog.md` silently **lost ~9
   tasks**.
2. Today's daily tasks **stopped appearing** in the grid.
3. Completed a backlog task — it **correctly moved to today** as a finished
   item.
4. "Cleared" (completed) a second backlog task — it **did not move to
   today**.
5. Refreshed the app — **today's tasks disappeared as well**.

The user's "chars choking" hypothesis is **ruled out**. The actual files
(provided 2026-08-07) contain no exotic characters; the regexes are
char-tolerant (`\s` + `trim()` absorb CRLF). The real trigger is structural:
the backlog had uncategorised tasks in **two** non-consecutive places
(before the first H1, and after a `## Added week of` marker that resets
category to null), producing two `null`-category sections whose
`{#each (key)}` collide → Svelte `each_key_duplicate`. Confirmed by repro
tests in `src/lib/repro-vanishing.test.ts` (3 new tests, all passing).

## Problem classification

This is a **data-integrity** bug, not a rendering bug. Two distinct loss
modes are visible in the report:

- **Mode A — silent file truncation:** ~9 backlog tasks vanish while
  *adding* tasks. The serializer can only lose lines if a write replaces
  the file with a stale or wrongly-spliced snapshot.
- **Mode B — tasks present on disk but invisible:** today's tasks
  "disappear" on refresh. The parser is line-based and never throws, so
  this means lines on disk no longer match `TASK_RE`, **or** the file
  written to disk is itself the truncated snapshot.

Both modes converge on one invariant: the app trusts `task.lineRange`
(captured at render time) against freshly-read file text without
re-locating the task by identity first. Any drift between the rendered
task's `lineRange` and the disk content turns a targeted splice into a
random deletion.

## Invariants being violated

1. **Line-preserving write-back.** Only the explicitly targeted line(s)
   may change. Every other line must pass through byte-identical. (AGENTS.md)
2. **Identity before index.** A mutation must never trust a cached
   `lineRange` to still point at the intended task; it must re-derive the
   index from the freshly-read file before splicing.
3. **Atomic cross-file move.** Write target first; roll back target on
   source failure. The rollback must remove *the block that was just
   inserted*, not "the last N lines of the file."
4. **Read-modify-write must not clobber a concurrently-changed file.** No
   version/size guard exists today.

## CONFIRMED root cause: duplicate `__none__` section key

Both `BacklogRail.svelte` (`backlogSections`) and `DayColumn.svelte`
(`sections`) build sections by **consecutive** grouping and key the
`{#each}` with `section.category ?? '__none__'`:

```ts
const sections = $derived.by(() => {
    const result: { category: string | null; tasks: Task[] }[] = [];
    for (const t of tasks) {
        const last = result.at(-1);
        if (last && last.category === t.category) last.tasks.push(t);
        else result.push({ category: t.category, tasks: [t] });
    }
    const seenCats = new Set(result.map(s => s.category));
    for (const h of fileHeaders)
        if (!seenCats.has(h)) result.push({ category: h, tasks: [] });
    return result;
});
```

```svelte
{#each sections as section (section.category ?? '__none__')}
```

The parser resets `category` to `null` when it crosses a `## Added week of`
marker (`WEEK_MARKER_RE`). The user's `Backlog.md` therefore yields
**two** non-adjacent `null` sections:

1. Pre-H1 tasks: `DMV Registration`, `Blog: Alph planner` (before `# PP`)
2. Post-week-marker task: `BM Packing 2h` (after `## Added week of 2026-08-10`)

Both map to the key `"__none__"` → `each_key_duplicate` → uncaught throw
during flush → the whole reactive cycle aborts → backlog rail and today's
column both stop repainting. Reproduced in
`src/lib/repro-vanishing.test.ts` ("backlog produces TWO null-category
sections → duplicate __none__ key").

The trigger is purely structural. The "char choking the app" was a
red herring: no exotic characters are required. The pre-H1 free tasks
combined with a task under the current week's rollover heading is enough.

### Why today's file shows `BM Packing 2h` as `[ ]` (not `[x]`)

`completeBacklogTask` reads `Backlog.md` fresh, then splices at
`task.lineRange[0]` captured at render time. The week-marker insertion
above the task shifted line numbers, so the cached index pointed at the
wrong line. The `.replace(/\[\s\]/, "[x]")` then no-oped on a line that
had no `[ ]`, and the splice removed a neighbour. Meanwhile `appendTask`
inserted the (wrongly-built) block into today using `task.category` which
was `null` (reset by the week marker), landing it as an unchecked line.
Net result observed: backlog still holds `[-] BM Packing`, today gained
`- [ ] BM Packing`. Reproduced in the stale-lineRange repro test.

## Other concrete defects found in code review

### D1. `moveTask` rollback corrupts the target when the block was inserted mid-file

`src/lib/state.svelte.ts` → `moveTask`, source-removal `catch` branch:

```ts
const rb = reread.split("\n");
rb.splice(rb.length - childLines.length - 1, 1 + childLines.length);
await writeFile(d, targetFilename, rb.join("\n"));
```

This assumes the inserted block sits at the **end** of the target file.
But `appendTask` inserts **before the first H1** for uncategorised tasks,
and **under a category section** (mid-file) for categorised ones. When the
block is mid-file, the rollback chops the *last* lines of the target —
destroying real tasks — while leaving the inserted block in place.

Trigger: any cross-file move (drag, roll-forward) whose source removal
fails (transient `locked`/`io` FsError, e.g. iCloud sync stall) **and**
whose target insertion was not at EOF.

### D2. `completeBacklogTask` trusts stale `task.lineRange` against fresh content

`src/lib/state.svelte.ts` → `completeBacklogTask`:

```ts
const backlogContent = await readFile(d, "Backlog.md"); // FRESH
const lines = backlogContent.split("\n");
lines[task.lineRange[0]] = lines[task.lineRange[0]]
    .replace(/\[\s\]/, "[x]").replace(/\[-\]/, "[x]");  // task.lineRange may be STALE
...
lines.splice(task.lineRange[0], task.lineRange[1] - task.lineRange[0] + 1);
await writeFile(d, "Backlog.md", lines.join("\n"));
```

`task.lineRange` comes from the `BacklogRail`-rendered object
(`appState.cache["Backlog.md"]`). If anything shifted line numbers
between render and this click — a `## Added week of` heading inserted by
a prior `addTask`/`completeBacklogTask`, a delayed `flushCompletion`
that already fired, a defaults insertion during `refresh()` — the index
points at the wrong line. The `.replace` then no-ops (wrong line has no
checkbox) and the `splice` removes an unrelated block. **This is the
direct mechanism for "backlog lost ~9 tasks": a single off-by-N splice
removes a contiguous run of lines.**

The same anti-pattern is present in `deleteTask`, `moveToCategoryInFile`,
`editTaskTitle`, `toggleStar`, `editTaskDuration`, `addSubtask`, and the
auto-complete branch of `toggleChild` — every one trusts `task.lineRange`
(or `child.lineIndex`) captured at render.

### D3. No identity-based re-location before splice

There is no helper that, given a `task` and freshly-read file text,
re-finds the task by a stable identity (e.g. matching `task.raw` within a
small window of the cached `lineRange`, falling back to a full-file
search) and returns a corrected `lineRange` (or signals "not found / file
changed"). Without it, every mutation is one stale render away from
corrupting the file.

### D4. Parser silently drops indented subtasks after a non-task indented line

`src/lib/md/parse.ts`, child-collection inner loop:

```ts
const cm = childLine.match(TASK_RE);
if (!cm) {
    if (childLine.trim() === "") { j++; continue; }
    break;                       // ← any indented non-task line breaks the block
}
```

A layout like

```
- [ ] task
  some indented note
  - [ ] real subtask
```

causes the inner loop to `break` at the note, so the real subtask is
never collected and is skipped by the outer loop (indent > 0 → `i++`).
The line is preserved on disk but **never rendered** — a pure Mode B
"invisible task" with no data loss. Not the primary culprit here, but a
real parser gap that produces the exact "stopped appearing" symptom.

### D5. read-modify-write has no concurrency guard

`readFile` → mutate → `writeFile` is the entire write path. There is no
mtime/size/version check. On iCloud (or any sync backend) the file can
be replaced between the read and the write; the app then writes a
snapshot based on the *old* content, reverting any tasks added by the
sync in the meantime. The retry logic in `files.ts` only retries on
`locked`, not on "content changed under me." This is the most likely
explanation for **Mode A** (tasks lost *while adding*) when no app-level
splice bug fired.

### D6. `refresh()` writes files during a read cycle

`refresh()` calls `applyDefaults` on every day file and `writeFile` for
missing-day creation, *during the refresh that the user expects to be
read-only*. If a defaults insertion or missing-day write interleaves with
an in-flight optimistic mutation (e.g. a pending `flushCompletion`
timer), two writers race on the same file with no ordering guarantee.
"Refresh made today's tasks disappear" (step 5) is consistent with a
defaults/missing-day write landing between an optimistic cache update and
its disk flush.

## Ranked hypotheses for this incident

| # | Hypothesis | Mode | Evidence fit | Confidence |
|---|------------|------|--------------|------------|
| **H1** | **Two `null`-category sections → duplicate `__none__` key → `each_key_duplicate`** | **B** | **Console error x10; file structure matches; repro test passes** | **CONFIRMED** |
| H2 | Stale `lineRange` in `completeBacklogTask` (D2) spliced the wrong block out of `Backlog.md` | A | BM Packing now in BOTH backlog (`[-]`) and today (`[ ]`, should be `[x]`); repro test passes | High |
| H3 | `moveTask` rollback (D1) chopped real lines from a target file on a transient source-write failure | A/B | Possible, needs a failed move | Medium |
| H4 | `refresh()` defaults/missing-day write (D6) raced an in-flight completion flush | B | "refresh → today's tasks disappeared" | Medium |
| H5 | FS-level lost write / iCloud overwrite (D5) reverted the file to a stale snapshot | A | "adding tasks → backlog lost tasks" with no app bug firing | Medium |
| H6 | A character in a task line made the mutated line stop matching `TASK_RE` | B | User's "chars choking" hypothesis | **RULED OUT** |
| H7 | Indented-subtask parser drop (D4) hid existing tasks | B | "today's tasks stopped appearing" | Low (layout-specific) |

### Why the duplicate-key crash makes tasks "disappear"

The `each_key_duplicate` error is **uncaught** during Svelte's `flush()`. An
uncaught error in one component's render aborts the entire flush cycle, so
*every* component that was due to re-render in that tick — including today's
`DayColumn` — keeps its stale DOM. This is why completing a backlog task
made today's column stop updating (the re-render that should show the
newly-moved task aborted), and why a manual refresh also appeared to wipe
today's tasks: the backlog rail re-throws on every flush, so the column
never gets to repaint.

The crash trace the user pasted (`CGVnMMYn.js ... each_key_duplicate` x10)
matches exactly: the backlog rail re-renders on every focus/refresh/write,
and throws each time.

H5 ("chars choking") is plausible but, on review, the regexes are
char-tolerant: `TASK_RE`, `H1_RE`, and `WEEK_MARKER_RE` all use `\s` and
`trim()` which absorb trailing `\r` (CRLF). The most likely "choking
char" candidates, if any, are:

- A title containing a literal `[ ]` or `[-]` **before** the real
  checkbox, so `setTaskLineStatus` / `cycleCheckbox`'s `replace` mutates
  the wrong bracket and the resulting line still parses but as the wrong
  status — not a disappearance.
- A title ending in a token like `9m`/`2h` that `parseDuration` strips,
  making the raw line on re-parse differ from the displayed title — not a
  disappearance.
- A line that, after mutation, gains a leading space or loses its `-`,
  e.g. via the `appendTask` "before first H1" path interacting with a
  `![[Backlog]]` embed line. Needs the actual file to confirm.

**The actual file contents are required to confirm or rule out H5.**

## Information needed from the user

To pin the trigger, please provide (paste here or in a follow-up):

1. The current contents of `Backlog.md` and today's file
   (`YYYY-MM-DD.md`) from the **live folder** — these are outside the
   repo and hold the "choking" evidence.
2. If available, the contents **before** the loss (a snapshot, iCloud
   version, or the `snapshots/` dir).
3. Browser DevTools **Console** output at the time of the loss —
   specifically any `[completeBacklogTask]`, `[moveTask]`,
   `[flushCompletion]`, `[writeFile]`, or `[cycleCheckbox]` lines.
4. Whether the folder is on iCloud Drive or a local folder.
5. The exact gesture used for "cleared another backlog task" (single
   checkbox click vs. long-press vs. subtask completion) — this
   determines which code branch ran.

## Proposed hardening (not yet implemented — pair mode)

A single defensive primitive fixes D2/D3 and makes D1's rollback correct:

```ts
/**
 * Re-locate a task in freshly-read file text by stable identity, falling
 * back from the cached lineRange to a full-file raw-match search.
 * Returns the corrected [start, end] line range, or null if the task is
 * no longer present (file changed under us).
 */
function relocateTask(content: string, task: Task): [number, number] | null
```

Every mutation in `state.svelte.ts` should call this against the
freshly-read content before splicing, and abort (with a user-visible
"sync conflict" toast + `refresh()`) when it returns null. This converts
silent data loss into a recoverable "file changed — re-syncing" message.

`moveTask`'s rollback (D1) should instead record the exact insertion
index returned by the append/insert step and splice *that* index, not
"end of file."

## Implemented fix

**Crash (each_key_duplicate):** a shared `sectionKey(category, index)`
helper in `src/lib/sections.ts` is now used by both `BacklogRail.svelte`
and `DayColumn.svelte` for their `{#each ... (key)}`. Appending the
section's position makes the key unique even when two legitimate
`null`-category sections exist (pre-H1 tasks and post-week-marker tasks),
or when H1 headers are duplicated. The consecutive-grouping builder is
unchanged — two null sections still render as two groups, which is correct
since they are genuinely separated by headers.

**Data loss (stale lineRange splices):** a `relocateTask(content, task)`
primitive in `src/lib/md/parse.ts` re-derives a task's line range from
freshly-read file text by raw identity (exact line match, disambiguated
by proximity to the cached index when two tasks share a raw line),
returning `null` when the line is gone. A matching `relocateChild`
re-derives a subtask's `lineIndex` within its parent's block.

Every splice-based and in-place mutation in `state.svelte.ts` now relocates
against the just-read content before touching a line index, and aborts to
a recoverable "File changed — re-syncing" toast + `refresh()` when the
identity is gone, instead of silently corrupting the wrong line:

- `completeBacklogTask`, `deleteTask`, `moveTask` (source removal),
  `moveToCategoryInFile`, `rollWeekToBacklog`, `toggleChild` (auto-complete
  + same-file parent-update branches), `duplicateTask`, `addSubtask`
  (deletions / block splices — the data-loss class);
- `editTaskTitle`, `toggleStar`, `editTaskDuration`, `toggleTask`,
  `completeTask` (undo), `flushCompletion`, `editChildTitle`,
  `toggleChild` (child toggle) (single-line edits — the line-corruption
  class).

`moveTask`'s rollback (D1) was rewritten to locate and remove the **exact
inserted block by content**, regardless of where `appendTask` /
`insertUnderWeekMarker` placed it. The previous implementation chopped the
last N lines of the target, which destroyed real tasks when the block was
inserted mid-file.

The content-based rollback removes the first exact block match. A
theoretically-more-precise variant (having the insert helpers return the
exact insertion line index) was considered and **rejected**: when the
target already holds a byte-identical block (a legitimate duplicate made
via the dup button or by re-adding a done task), the two instances are
indistinguishable to the user, so removing either leaves the file in the
same visible state. The ambiguity has no user-visible consequence, so the
extra refactor is not warranted.

## Repro tests (added, passing)

`src/lib/repro-vanishing.test.ts` — 3 tests encoding the bug as it existed:

- [x] backlog produces TWO null-category sections → duplicate `__none__` key
- [x] all task-row keys are unique within a single file (rules out the task-row key)
- [x] `completeBacklogTask`-style stale lineRange splice removes the wrong block

## Fix tests (added, passing)

`src/lib/bug03-fix.test.ts` — pure tests for the new primitives:

- [x] two null-category sections get distinct `sectionKey`s; duplicate H1
      headers also get distinct keys via the index.
- [x] `relocateTask` returns the fresh task when valid; corrects the range
      when lines were inserted above; returns null when the raw line is
      gone; disambiguates duplicate raw lines by proximity.
- [x] `relocateChild` returns the fresh child with the correct lineIndex;
      returns null when the parent or child line is gone.

`src/lib/state.test.ts` — integration tests against the in-memory fs mock:

- [x] `completeBacklogTask` with a stale `lineRange` (heading inserted
      above after render) removes the **correct** block; today receives
      `[x]`; the heading is intact; no other tasks lost.
- [x] `completeBacklogTask` aborts with a "re-syncing" conflict and writes
      nothing to today when the task line is already gone.
- [x] `moveTask` rollback removes the exact inserted block when it was
      placed mid-file (under an existing H1, before a later H1), leaving
      the pre-existing EOF task intact (the old EOF-chop would delete it).

Full suite: 176 passing (162 prior + 14 new), `pnpm check` 0 errors,
`pnpm build` clean.

## Follow-up: structured error model + cache reconvergence

The original fix left error messaging as free-form strings. A review of
every `fail()` call found three problems: (1) the new relocate-abort
guards and the old write-failure guards used inconsistent phrasings for
the same condition; (2) several messages referenced a "Sync button" that
does not exist in the UI; (3) the write-failure branches toasted but did
not force a refresh, so an optimistic cache flip (e.g. a checkbox the UI
already turned) could keep lying while disk disagreed — the same
UI/disk-divergence failure class as the vanishing-tasks bug, lower
severity.

Introduced a structured `AppError` type (`message`, `severity`,
`recovery`) in `src/lib/types.ts` and a factory module `src/lib/errors.ts`
so wording and recovery hints stay consistent. `appState.lastError` is now
`AppError | null`; the toast renders `warn` in red (longer duration) and
`info` neutral.

Three classes:
- **fileChanged** (`info`, `retry`) — relocate abort; cache already
  re-synced, nothing broke.
- **writeFailed** (`warn`, `reload`) — a disk write failed; the app now
  calls `await refresh()` in every such catch so the cache reconverges to
  disk truth instead of staying optimistically flipped.
- **folder/access** (`warn`, `reconnect`/`reload`) — folder inaccessible.

Added two integration tests asserting the severity/recovery shape of each
class. The non-existent "Sync button" references are gone.

## Affected code

| File | Role | Defect |
| --- | --- | --- |
| `src/lib/state.svelte.ts` | `completeBacklogTask`, `moveTask`, `deleteTask`, `moveToCategoryInFile`, `editTaskTitle`, `toggleStar`, `editTaskDuration`, `addSubtask`, `toggleChild` | D2/D3 — trust stale `lineRange` |
| `src/lib/state.svelte.ts` | `moveTask` rollback | D1 — wrong rollback index |
| `src/lib/state.svelte.ts` | `refresh()` | D6 — writes during read cycle |
| `src/lib/md/parse.ts` | child-collection inner loop | D4 — drops indented subtasks |
| `src/lib/md/serialize.ts` | `cycleCheckbox` / `setTaskLineStatus` | reviewed; char-tolerant, low suspicion |
| `src/lib/fs/files.ts` | `readFile`/`writeFile` | D5 — no concurrency guard |

## Related

- `docs/bugs/02--backlog-mirror.md` — duplicate *rendering* of the same
  identity (not data loss, but shares the identity-fragility theme).
- `docs/icloud-fsaa-postmortem.md` — FS-level lock/overwrite history.
- `docs/plan-cat-bugs-and-notes.md` — prior cluster of category bugs,
  same root theme (state models tasks, not file shape).
