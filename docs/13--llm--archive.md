# 13 — llm — Backlog Archive Drawer (response to 13--usr--archive)

## Synopsis (plain English)

**What the feature does:** one button sweeps backlog tasks older than 2 weeks
into a new `Archive.md` file. A drawer in the UI shows the archive; tasks can
be pulled back (restore) or deleted for good.

**Key decisions and why:**

| Decision | Choice | Why / effort |
|---|---|---|
| Where does archived data live? | Separate `Archive.md` file | Keeps backlog parsing cheap; markdown-first rule. No extra effort — same plumbing as Backlog.md |
| How old is "stale"? | The `## Added week of` heading the task sits under | Only reliable timestamp. ~1h parser addition, side lookup, doesn't touch `Task` |
| What if a task has no date? | Skip it — never guess | Cheapest safe option; it just stays in the backlog |
| How does the move happen? | Same batch-write + rollback as the existing roll-week button | Proven code, mostly copied. Low risk |
| Restore / delete | Restore puts task back under its category; delete asks first | Category re-creation already works today. Low effort |
| Archive drawer | New component, lazy-reads Archive.md | ~2–3h, mostly UI styling |
| Auto-sweep on Monday | Deferred, needs your call (Q2 in usr doc) | Zero effort now |

**Total effort: roughly a working day** — Part A ~2h (sweep + tests),
Part B ~2–3h (drawer UI), Part C deferred.

---

### Is this too much complexity? Simpler options

The full plan has three moving parts: a new file, a parser change, and a
drawer. Two leaner cuts, both still fully markdown-first:

1. **Lean-est (XS–S, ~1–2h):** no new file. Sweep just appends stale tasks
   to a `## Archive` section *inside Backlog.md* and filters it out of the
   active backlog list in the UI. One file, no parser change (week markers
   already parsed), no rollback across two files. Costs: Backlog.md grows
   forever, and the section heading isn't a date record.
2. **Middle (S, ~2h):** keep `Archive.md` and the sweep, but skip the
   week-marker parser work — date tasks by the sweep itself
   (`## Archived 2026-05-04` headings, written at sweep time). Restores
   date items to "now" in the backlog, which is correct anyway. The
   2-week staleness check then reads Backlog.md's existing week markers
   without any parser change: just scan headings and line numbers.

**Recommendation: option 2.** It drops the riskiest bit (the parser
side-lookup) and keeps the file separation, which is the part that pays off
long-term. The technical detail below still describes the full plan; option
2 changes Part A to "resolve staleness by heading scan" and nothing else.

---

Related research: `docs/11--llm--spec.md` (roll week to backlog, `insertUnderWeekMarker`,
batch rollback pattern), `docs/09--llm--faux-category-assessment.md` (category
restoration on backlog moves), `docs/adr/003-line-preserving-serializer.md`,
`docs/adr/001-markdown-first-source-of-truth.md`.

---

## Phase 1: Step-Back Analysis

1. **Problem classification — lifecycle state management + batch file
   migration.** The task is a bulk conditional relocation of parsed entities
   between two markdown files, driven by a staleness predicate, with a new
   read-only-ish view (the drawer) as the UI surface. Same problem shape as
   `rollWeekToBacklog` (spec 11 Part B): select tasks by predicate → batch
   move across files → refresh cache.

2. **Governing principles.** Markdown-first (ADR 001): archive state must
   live in `.md`, not in component state or localStorage. Line-preserving
   writes (ADR 003). Idempotency: the sweep should be safe to run twice
   without duplicating or corrupting. Atomicity: target-first write with
   rollback, as spec 11 already established.

3. **Data structures & complexity.** Selection is a single pass over
   `appState.cache["Backlog.md"]` tasks (O(n)); grouping archived tasks by
   archived-week for the drawer is O(n) with a Map keyed by ISO week.
   No fancy structures needed. Space O(n) in Archive.md — acceptable
   because Archive.md is only parsed when the drawer opens (lazy read),
   keeping backlog refresh cheap.

## Phase 2: Edge Cases & Architecture

1. **Edge cases (from usr doc, resolved):**
   - *No week marker:* fall back to `task.file` origin date if the task
     still lives in a past daily file; tasks with neither get
     `archivedDate = today` and are excluded from the 2-week sweep (never
     guessed-old).
   - *Category H1 missing on restore:* recreate the H1 at the end of
     Backlog.md (existing `appendTask` behavior handles this — verify with
     a unit test, spec 09 §4 covers this path).
   - *iCloud conflict:* Archive.md follows the existing conflict-copy
     detection; no special casing, but add a manual test.
   - *Idempotency:* sweep filters `isStale && file === "Backlog.md"` —
     archived tasks are no longer in Backlog.md, so re-running is a no-op.
   - *Empty archive:* drawer renders "Nothing archived yet" — trivial but
     must be styled deliberately (per design guidelines).

2. **Architectural pattern — batch migration with undo (Command pattern
   lite), mirroring `rollWeekToBacklog`.** One action, one atomic write
   pair, one cache refresh, one toast with undo. The drawer is a pure
   read view over `cache["Archive.md"]`. This fits because it reuses the
   proven rollback machinery rather than inventing a new write path —
   serializer stays the single write path (architecture constraint).

## Phase 3: Plan

### Part A — Staleness predicate + sweep action (S, ~2h)

- `lib/state.svelte.ts`: add `archiveStaleTasks(minAgeDays = 14)`.
  Predicate: for each Backlog.md task, resolve its week marker (parse the
  `## Added week of YYYY-MM-DD` heading it sits under — parser already
  yields line numbers; extend `parse.ts` to expose the section marker per
  task, keeping `Task.raw` intact). Fall back to origin file date, else
  skip.
- Batch move: serialize removals from Backlog.md (line-range excision,
  keeping headers of now-empty sections? **Decision: leave empty H1s
  behind** — the empty-category picker already expects them) and appends
  to `Archive.md` under `## Archived YYYY-MM-DD` per sweep.
- Target-first write + rollback, `refresh()` both files, toast with count
  + optional undo (restore-all).
- Tests: `state.test.ts` — stale selection with/without markers, idempotent
  second run, rollback on simulated source failure.

### Part B — Archive drawer UI (S–M, ~2–3h)

- New `ArchiveDrawer.svelte` alongside `BacklogRail`/`DoneLog` patterns:
  closed by default, expands from the same rail family, grouped by
  category, header shows `# Category` H1s extracted from Archive.md (same
  `extractH1s` path as backlog headers).
- Lazy read: parse Archive.md only on first open.
- Restore action: move task back under original category in Backlog.md
  (atomic, refresh both). Delete action: explicit confirm, line-range
  excision in Archive.md.
- Archived date badge from the `## Archived` heading the task sits under.
- Tests: restore round-trip byte-equality (line-preserving invariant),
  delete excision, empty state.

### Part C — Optional auto-sweep banner (deferred, pending usr Q2)

One-time banner on new-week detection: "N stale tasks older than 2 weeks —
Archive?" with Archive / Dismiss. Only after Parts A/B are verified.
Same shape as the roll-week banner considered in spec 11.

### Test plan

- Unit: predicate correctness, sweep idempotency, restore round-trip,
  category re-creation, rollback.
- Manual (Playwright later): open drawer, restore one, delete one, iCloud
  folder conflict-copy present while drawer open.

### Difficulty notes

- The hard part is **dating backlog tasks** — the week marker is the only
  reliable timestamp; extending the parser to record section markers per
  task must not disturb `raw`/`lineRange` (keep it as a separate lookup
  map keyed by line index to avoid touching `Task`).
- Empty H1s left behind in Backlog.md are intentional and consistent with
  existing empty-category support.

### Proposed commits

1. `feat(archive): stale-task sweep with atomic batch move + tests`
2. `feat(archive): archive drawer with restore and delete`

## Open questions → carried in 13--usr--archive.md (Q1–Q5)

Defaults proposed: threshold from week marker (Q1), manual sweep first,
auto banner as Phase C decision (Q2), separate `Archive.md` (Q3), full
task intact on archive (Q4), plain grouped list MVP (Q5).

---

**Status:** Part A (per-task archive button) shipped — see
`13--llm--status--archive.md`. Drawer (Part B) and batch sweep (Part C)
not started.
