# Postmortem — grid version (v0)

Snapshot of why the time-slot grid version of Alph-Planner is being
retired in favor of the markdown-first rewrite. Written before the
rewrite begins so the lessons are recoverable later.

## What's wrong

Four bugs surfaced in five minutes of normal use. All four trace to
the same root cause.

### Observed bugs

1. **Changing a task's priority makes it disappear from its time
   slot.** The task is still in the sidebar; its session block is
   gone from the grid.
2. **Moving a task to overflow sometimes changes its priority.**
   Suspected to be a duplicate-task rendering artifact rather than a
   real priority mutation, but unconfirmed.
3. **Completing or deleting a task does not remove it from the left
   sidebar.** The session block clears from the grid, but the task
   row in the inbox stays.
4. **Tasks appear on the calendar that are not in the left sidebar.**
   The inverse of #3 — sessions render for tasks the inbox isn't
   listing.

### Single root cause

The state model has **four parallel collections** that must be kept
in sync by mutation:

- `app.tasks[]`
- `app.sessions[]`
- `app.unscheduled[]`
- `app.done[]`

There is no derivation. The Inbox reads `tasks`. The grid reads
`sessions`. The overflow rail reads `unscheduled`. The done log reads
`done`. Every mutation has to remember to update the right
combination of collections, and the scheduler is destructive — every
"structural" edit (priority, duration, session count) yanks the
task's placements and re-runs the placer against remaining occupancy.

Mapped to the bugs:

- **#1**: `updateTask` treats priority as structural and calls
  `rescheduleTask`, which removes the task's sessions and re-places
  them. If higher-priority tasks now occupy what were the slots, it
  falls into overflow. From the outside, "changed a knob → task
  vanished."
- **#3**: `markDone` updates `sessions` and `done` but never the
  `tasks` row, and the inbox doesn't filter `sessionsDone ===
  sessionsTotal`. Three places to ask "is this task done"; none
  aligned.
- **#4**: same shape as #3 inverted. Whatever the inbox is filtering,
  the grid isn't.
- **#2**: most likely a render artifact from duplicate-title tasks,
  not a real mutation — but the duplicate-task surface itself is
  another product of the model (you can have N tasks with the same
  title because identity is the synthetic id, not anything the user
  sees).

The bugs aren't independent. They are four leaks from one model.

## How it happened (hypothesis)

The original SPEC was reasonable for its stated goal: "input tasks,
auto-place into a weekly grid, drag to re-plan." The data model in
that SPEC was already denormalized — separate `tasks` and `sessions`
arrays, separate `unscheduled` array — but for the v1 scope it was
manageable. Two collections, one direction of flow (task → sessions),
one place where state could diverge.

Things accumulated from there:

- **Done history** added a fourth collection and a third place to ask
  "is this finished?"
- **Block-offs** and **weekend toggle** added scheduling rules but no
  new state — fine.
- **Schedule direction**, **weather**, **dev snapshots**,
  **selectedTaskId**, **drag** state — each a small addition, none
  individually unreasonable.
- **Duplicate task** and **createTaskAtSlot** added new ways for a
  task to enter the system without going through the parser, each
  with slightly different defaults.
- **rescheduleTask** vs **autoSchedule** vs **placeTaskSessions** —
  three placement paths, each touching different subsets of state.

Each addition was a small, locally-correct change. The model was
never revisited as the surface grew. Mutations multiplied; the rule
"keep the four collections in sync" stayed implicit. Bugs surfaced
where two paths disagreed about which collections to touch, and the
fixes were applied at the symptom (the specific path), not at the
cause (no derivation).

Contributing factors:

- **No model invariant tests.** Nothing asserts "every session has a
  task" or "no task is both in `done` and unfinished" at runtime.
  Drift was invisible until it surfaced as a UI bug.
- **Destructive scheduler as default.** The placement algorithm was
  written as "wipe and re-run" rather than "incrementally adjust."
  This was simpler to implement and made `autoSchedule` clean, but
  it pushed every priority/duration edit through a destructive path
  where placements could silently land in overflow.
- **Hidden side effects.** `updateTask` looks like a setter; it isn't
  — it can move sessions to overflow. The cost of editing a field
  isn't visible from the call site.
- **No clear ownership of "is this task active."** Three signals
  (`tasks` membership, `sessions` presence, `sessionsDone <
  sessionsTotal`) were each treated as the answer in different
  places.

## What this teaches the rewrite

The markdown-first rewrite (see `SPEC.md` and
`docs/markdown-first-plan.md`) is shaped directly by these failures:

- **One source of truth** — the files. Everything else is derived.
- **No "structural" vs "non-structural" fields.** Editing a field
  edits a field; it does not trigger placement logic. Placement
  (which day a task is on) is its own explicit edit.
- **No separate done/overflow/sessions arrays.** Done = `[x]` in a
  file. Overdue = unchecked line in a past-dated file. Both are
  queries, not stored state.
- **Round-trip invariant test.** Before any write, the test "parse →
  serialize = byte-identical" runs against real files. The kind of
  silent drift that produced these bugs becomes loud.
- **No duplicate-identity ambiguity.** A task is its line in a file.
  Two tasks with the same title in the same file are two distinct
  lines; there is no synthetic id to mismatch against.

## Salvage list (for reference)

Code surviving the rewrite:

- `src/lib/parser.ts` — duration grammar still useful.
- `src/lib/dates.ts` — week math.
- PWA shell, Vercel adapter config, manifest.
- `mockup.html` patterns (self-contained HTML, inline CSS) — the
  convention is reused for `mockup-md-first.html`.

Code being discarded:

- `src/lib/store.svelte.ts` — the four-collection state and all its
  mutators.
- `src/lib/scheduler.ts` — the destructive placement algorithm.
- `src/lib/persistence.ts` — localStorage as truth.
- `WeekGrid.svelte`, `Unscheduled.svelte`, `Inbox.svelte` — bound to
  the old model; UI patterns may be cribbed but the components are
  rewritten.

The current `main` will be tagged `v0-grid-archive` before the
rewrite branch is cut, so this code is recoverable indefinitely.
