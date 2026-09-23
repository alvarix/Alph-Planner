# 13 — usr — Backlog Archive Drawer

## Goal

Backlog items older than 2 weeks (stale) should be swept into a **closed
archive drawer**, out of the active backlog, so the backlog stays readable
and doesn't grow forever. Archived items are not deleted — they can be
restored or reactivated later.

## Motivation

- Backlog is the dumping ground for rolled weeks; stale items bury the
  live ones.
- No mechanism currently exists for "deciding not to do this yet" short of
  deleting the task entirely.

## Requirements (draft)

- [ ] Stale = backlog task whose added-week marker (or creation context) is
      older than 2 weeks. Confirm threshold semantics (see questions).
- [x] Archive affordance on **all** tasks: single **bl** button — short
      press moves to backlog, long press (~0.5s) archives; on backlog rows
      it reads **arch** and archives on short press (replaces the old
      backlog-only arch button).
- [x] Archive tasks via a per-task button on backlog rows (decision: button
      first, batch sweep demoted to optional future work).
- [x] Archived tasks live in a **separate `Planner Archive.md`** file (same
      markdown-first discipline; no hidden state).
- [x] Archived items show their **archive date** (`## Archived YYYY-MM-DD`
      heading per date, visible in the app and in Obsidian).
- [x] Collapsible **Archive section in the backlog rail** (drawer-lite):
      closed by default, lists archived items with dates.
- [x] Full archive drawer UI: **category-grouped** list (uncategorized
      last), tasks keep chronological order inside each group, dates on
      rows. Search/filter deferred.
- [x] Restore: task moves back to Backlog.md under its original category —
      `restoreFromArchive` action + "restore" button in the Archive section.
- [ ] Delete permanently from archive (explicit, with confirm) — delete
      button currently works via the standard row controls; no archive-
      specific confirm UI yet.
- [x] Manual copies into `Planner Archive.md` verified compatible with the
      parser (dated sections, nested categories, legacy `[-]`, children).
- [ ] Optional batch sweep of tasks older than 2 weeks (deferred — manual
      button covers the core need; sweep = loop over single-task move +
      staleness predicate once Part B ships).
- [x] Serialized writes are line-preserving; atomic for cross-file moves
      (inherited from `moveTask`).
- [x] Tests: archive round-trip (categorized + uncategorized), no-op guard.
## Edge cases

- [ ] Task with no `## Added week of` marker — how do we date it?
- [ ] Restore into Backlog.md where the original category H1 no longer
      exists.
- [ ] iCloud sync conflict while Archive.md is being written.
- [ ] Empty archive (drawer should show a sane empty state).
- [ ] Restored task immediately becomes stale again — is that correct?

## Questions for Alvar

1. **Threshold semantics:** is "older than 2 weeks" measured from the
   added-week marker in Backlog.md, or from the task's original source
   day file (when known)? Default proposal: week marker, fallback to
   file date of origin.
2. **Auto-pilot:** sweep manually only, or auto-run on first Monday
   refresh of a new week with a banner ("8 stale tasks archived — Undo")?
3. **Archive.md vs new heading in Backlog.md:** separate file keeps the
   backlog parse cheap — agree?
4. Should archived items keep their **duration/estimate** and be
   restorable intact, or is archive a "cold copy" (title only)?
5. Should the archive be searchable/filterable at this stage, or plain
   grouped list first (MVP)?

## Feedback

- [ ] Alvar reviewed: ______
