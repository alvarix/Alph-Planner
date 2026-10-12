# 14 — usr — Batch: subtask delete, roll category bug, Obsidian link, defaults roll, completion revert

Date raised: 2026-09-21 (session header) · captured 2026-10-07

## Task list (verbatim)

- [ ] add a button to delete subtask
- [ ] bug: rolling task into backlog **still** forgot cat (mtk: "Tenant Deposit" 092326 with subtasks, lost it's cat)
- [ ] add obsidian link (and preview)
- [ ] uncompletted defaults added to backlog at end of week erroneously
    -  9-12, oddly I hadnt noticed them prev weeks
    -  they were not in backlog.md ?
- [ ] Undo a past feature - past todos checked move to today
- [ ] make a link in settings to open [this file](/Users/alvarsirlin/Library/Mobile Documents/iCloud~md~obsidian/Documents/MasterAlf/*Alph-planner.md), and add a symlink into docs/

## Clarifications needed (answered in chat)

1. **"obsidian link (and preview)"** — what exactly? Per-task open-in-Obsidian + hover
   preview of the note? Inline `[[wikilink]]` rendering? Or a link to the index note?
2. **"Undo a past feature — past todos checked move to today"** — remove the overdue→today
   move entirely, or keep it for Backlog.md and only stop it for past-day files?
3. **Item 2 reproduction** — the current code preserves categories for rolled tasks in all
   synthesised cases (top-level `# mtk`, existing prior week section, existing same-week
   `# mtk` group, single `bl` move, with subtasks). Need the real day file + Backlog.md
   section, and confirmation the PWA cache was cleared after the fix (`sync`/clear cache).
4. **Symlink** — exact filename is `*Alph-planner.md` (leading literal asterisk) or a glob
   for `Alph-planner.md`? Should the symlink be committed or gitignored (machine-specific)?

## Feedback

- [ ] Alvar reviewed: ______
