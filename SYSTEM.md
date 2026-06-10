# Alph-Planner — System Overview

## Product Purpose

A local-first weekly task planner that reads and writes plain Markdown files. The user's `.md` files are the only source of truth — no database, no backend, no cloud sync required. Designed for use alongside Obsidian or any Markdown editor.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | SvelteKit 5 (runes mode) |
| Build | Vite 8 |
| Language | TypeScript 6, strict mode |
| Styling | CSS custom properties (B&W palette, no framework) |
| File Access | File System Access API (Chromium only) |
| Persistence | IndexedDB (FS handle) + localStorage (UI state) |
| PWA | vite-plugin-pwa, auto-update service worker |
| Testing | Vitest (unit), Playwright (E2E, Chromium only) |
| Deployment | Vercel (adapter-vercel, SSR) |

## Core Architecture

The app is a **thin UI layer over local Markdown files**. There is no database or server-side data store.

```
Browser ↔ File System Access API ↔ Local .md files
```

Key systems:
- **`lib/fs/`** — Folder picker, file read/write, IndexedDB handle persistence
- **`lib/md/`** — Markdown parser, line-preserving serializer, defaults, notes extraction
- **`lib/state.svelte.ts`** — In-memory cache of parsed files; all mutations go through here
- **`lib/components/`** — Svelte UI components (DayColumn, BacklogRail, TaskRow, etc.)

## Data Flow

### Load
1. App mounts → restore `FileSystemDirectoryHandle` from IndexedDB
2. If permission granted → `refresh()`: read all `.md` files in parallel, parse each into `Task[]`, cache results
3. Svelte reactivity renders week view from cache

### Task mutation (toggle, edit, move, delete)
1. User interaction → action function in `state.svelte.ts`
2. Read raw file content from disk
3. Apply mutation via serializer (only the targeted line changes; all other lines pass through byte-identical)
4. Write file back to disk
5. Invalidate cache for affected file(s) → re-render

### External edit sync
- `window.focus` event triggers `refresh()` to pick up changes made in Obsidian or another editor

### Cross-file move (atomic)
1. Write task to target file
2. Remove from source file
3. On source-write failure → rollback target

## Deployment

- Hosted on Vercel (SSR, no API routes used)
- PWA installable from Chrome; service worker caches static assets
- Can also be run locally with `pnpm preview` or `pm2` for persistent local hosting

## Constraints

- **Chromium only** — File System Access API is not supported in Safari or Firefox
- **Single user** — No multi-user, auth, or cloud sync (by design)
- **Local files only** — Remote sync is a future consideration (see `docs/spec-remote-sync.md`)
- **iCloud conflicts** — Detected and surfaced (not auto-resolved)
- **No hot-reload on file changes** — Sync relies on window focus events, not file watchers

## Guiding Principles

1. **Markdown files are the source of truth** — the app never owns data; it edits the user's files
2. **Preserve what you don't understand** — serializer writes back only mutated lines; all other content (prose, frontmatter, comments) is untouched
3. **Simplicity over completeness** — no time-slot grid, no drag-to-schedule; tasks are plain list items
4. **Interoperable** — files remain valid, readable Markdown for Obsidian and any other tool

## Future Considerations

- Remote sync (S3, Dropbox, or custom server) — spec exists at `docs/spec-remote-sync.md`
- Safari/Firefox support blocked on File System Access API adoption
- State history / undo — spec exists at `docs/spec-dev-state-history.md`
- More recurring cadence options (daily, quarterly) in Defaults.md
