# AGENTS.md — Coding Agent Instructions

## Read First

This is a **local-first Markdown task planner**. The app has no database or backend server. All data lives in the user's local `.md` files accessed via the File System Access API. Read `SYSTEM.md` for a high-level overview.

## Technologies in Use

- SvelteKit 5 with **runes mode** (`$state`, `$derived`, `$effect`) — not the legacy stores API
- TypeScript 6 strict mode
- Vite 8, no Webpack, no Rollup config
- Vitest for unit tests, Playwright for E2E (Chromium only)
- Plain CSS with custom properties — no Tailwind, no CSS-in-JS, no Sass
- `date-fns` for date math, `svelte-dnd-action` for drag-and-drop, `zod` for runtime validation

## Architecture Constraints

- **Never store task data outside of `.md` files.** No IndexedDB task data, no server API calls, no hidden state. The serializer must remain the single path for writes.
- **The serializer is line-preserving.** Only the explicitly targeted line(s) change. Every other line passes through byte-identical. Do not reformat, re-sort, or re-indent the file on write.
- **All state mutations go through `lib/state.svelte.ts`.** Do not write files directly from components.
- **Refresh after every write.** Any function that writes to disk must call `refresh()` on the affected file(s) afterward to keep the in-memory cache consistent.
- **Cross-file moves must be atomic.** Write target first; on source failure, roll back the target write.
- **Do not break iCloud conflict detection.** The `detectConflicts()` function in `lib/fs/files.ts` relies on the naming pattern `(conflict copy).md`.

## Coding Conventions

### Svelte Components
- Use runes mode syntax: `$state()`, `$derived()`, `$effect()`, `$props()`
- Props destructured at the top of `<script>`: `let { foo, bar } = $props()`
- No legacy `export let`, `$:`, or `writable()` stores
- Keep components focused. Extract shared markup into `TaskSection.svelte`-style components when more than two consumers exist

### TypeScript
- Strict mode is required — no `any`, no `as unknown as`
- All interfaces defined in `lib/types.ts` — add new types there
- Zod schemas for external/user-provided data only (not internal types)

### CSS
- Use existing CSS tokens from `src/lib/app.css` — do not hardcode hex colors
- Token categories: `--surface-*`, `--border-*`, `--text-*`, `--bar-*`, `--crimson`, `--yellow`
- Component styles in `<style>` blocks; no external CSS files for components
- No inline `style=""` with hardcoded values; use tokens or computed variables

### Markdown Parsing / Serialization
- Parser lives in `lib/md/parse.ts` — uses regex constants (`H1_RE`, `TASK_RE`, `DUR_RE`, `STAR_RE`)
- Serializer lives in `lib/md/serialize.ts` — mutate only target lines; leave all others intact
- Task line format: `- [ ] title` (unchecked), `- [x] title` (done), `- [ ] **title** 1h` (starred, with estimate)
- Category headers: `# Category Name` (H1 only)
- Do not add/remove blank lines or reformat indentation during serialization

### File Names
- Daily files: `YYYY-MM-DD.md` (ISO date, local time)
- Special files: `Backlog.md`, `Defaults.md`
- Conflict files: match pattern `* (conflict copy).md`

## Preferred Patterns

- **Optimistic UI** — update cache immediately; write to disk; if write fails, refresh cache from disk
- **Null for "no category"** — uncategorized tasks have `category: null`, not `category: ""`
- **`lineRange` for targeting** — task mutations use `[start, end]` line indices, not title matching
- **`raw` for round-trips** — `Task.raw` and `ChildTask.raw` store the original line for write-back
- **localStorage for UI state** — fold state, `hidePast` toggle; never use it for task data
- **IndexedDB only for the FS handle** — see `lib/fs/handle-store.ts`

## What to Avoid

- Do not introduce new npm dependencies without strong justification — the current dep list is intentionally minimal
- Do not add a backend server, database, or cloud service unless building the remote sync feature in `docs/spec-remote-sync.md`
- Do not use Svelte 4 stores (`writable`, `readable`, `derived`) — this codebase uses runes exclusively
- Do not use Tailwind or any CSS utility framework
- Do not reformat the user's Markdown files (no prettier, no sorting, no blank-line normalization)
- Do not add Safari/Firefox polyfills for File System Access API — the constraint is intentional
- Do not add error handling for impossible internal paths — only validate at system boundaries (user input, file reads)

## Testing Requirements

### Unit Tests
- All parsing and serialization logic must have unit tests in `src/lib/md/*.test.ts`
- Run: `pnpm test:unit`
- Tests use Vitest; test files follow `*.test.ts` naming

### E2E Tests
- Smoke tests in `tests/app.test.ts` using Playwright
- Chromium only — do not add other browser targets
- Run: `pnpm test`

### Type Checking
- Run before committing: `pnpm check`
- Fix all TypeScript errors — no `@ts-ignore` suppressions

## Workflow Expectations

1. **Read the file before editing it.** Never modify a file you haven't read in this session.
2. **Run `pnpm check` after changes** to catch type errors early
3. **Run `pnpm test:unit` after changes to `lib/md/`** — parser and serializer are covered by 60+ unit tests
4. **Changes to state actions** (`state.svelte.ts`) require verifying the refresh cycle works correctly
5. **Changes to the serializer** require verifying the line-preserving invariant holds (no extra lines added or removed)

## Approaching Changes Safely

- For serializer changes: write a unit test first that encodes the expected before/after behavior
- For new task fields: update `Task` in `lib/types.ts`, then parser, then serializer, then UI
- For new UI state: prefer `$state()` in the component; promote to `state.svelte.ts` only if 2+ components need it
- For file structure changes: `Backlog.md` and `Defaults.md` are special-cased — check all places they're referenced before renaming

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | All TypeScript interfaces |
| `src/lib/state.svelte.ts` | App state + all mutation actions |
| `src/lib/md/parse.ts` | Markdown → Task[] parser |
| `src/lib/md/serialize.ts` | Task mutations → file content |
| `src/lib/md/defaults.ts` | Recurring task defaults (Defaults.md) |
| `src/lib/fs/files.ts` | File read/write, directory listing |
| `src/lib/fs/folder.ts` | Folder picker, permission management |
| `src/lib/fs/handle-store.ts` | IndexedDB persistence for FS handle |
| `src/lib/dates.ts` | Week navigation utilities |
| `src/lib/ui/foldState.ts` | localStorage category fold state |
| `src/routes/+page.svelte` | App entry point, layout orchestration |
