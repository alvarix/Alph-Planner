# LLM Notepad — Alph-Planner decisions

Running log of non-obvious decisions made during the markdown-first rewrite.
New sessions should read this before touching the codebase.

## File format: H1 as category, not date

**Decision (2026-05-12):** H1 headings in daily files are category labels,
not date headers. The date is encoded in the filename (`YYYY-MM-DD.md`).

```markdown
# Work
- [ ] **ship invoice** 1h
- [ ] review contract

# Personal
- [ ] groceries
```

**Why:** Daily notes in Obsidian don't need a redundant date heading since
the filename carries that information. Freeing H1 for categories gives the
user a lightweight grouping mechanism that Obsidian renders as section headers.

**Implications for parser (`src/lib/md/parse.ts`):**
- H1 lines set `category` on subsequent tasks; resets on next H1
- Tasks before any H1 get `category: null`
- `Backlog.md` follows the same format — H1 categories work there too
  (e.g. `# Work`, `# Someday`)

**Implications for UI (`DayColumn.svelte`):**
- Tasks with the same category are grouped under a `section-head` divider
- Subtasks get a color-matched left border per parent group (5-color palette,
  auto-assigned in column order)

## Backlog = Backlog.md, not top-of-weekly-note

**Decision (2026-05-12):** The running backlog lives in `Daily/Backlog.md`
as a flat `- [ ]` list (with optional H1 categories). The user previously
kept freeform todos at the top of a weekly note; that workflow is retired.

The app reads `Backlog.md` for the left rail. Past unchecked tasks from
daily files also surface in the rail with a red date tag.

New daily files created by the app (drag to future day, or `+` on empty
column) are seeded with `![[Backlog]]` at the top so Obsidian renders the
backlog inline, matching the user's existing template habit.

## PWA + SSR: navigateFallback must be null

**Decision (2026-05-12):** `vite-plugin-pwa` with `adapter-vercel` (SSR)
must set `workbox.navigateFallback: null`. The default config adds a
`NavigationRoute` pointing at `index.html`, which does not exist as a
precached asset in SSR mode — throws `non-precached-url` at runtime and
breaks the installed app.

Also: `globPatterns` should exclude `.html` since there is no static HTML
to precache in SSR mode.
