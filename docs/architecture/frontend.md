# Frontend Architecture

## Responsibilities

- Render the weekly calendar view (7 day columns) and backlog rail
- Translate user gestures (click, drag, keyboard) into state mutations
- Display the in-memory cache reactively; never fetch data independently
- Persist UI-only state (fold, hidePast) in localStorage

## Component Hierarchy

```
+page.svelte
├── FolderPicker          — initial setup / permission re-grant overlay
├── topbar
│   ├── Week nav (prev / today / next)
│   ├── Upcoming toggle (hidePast)
│   ├── Done log toggle
│   ├── Folder badge
│   └── Conflict badge
├── BacklogRail           — left sidebar, tasks without a date
│   ├── TaskSection[]     — grouped by H1 category
│   │   └── TaskRow[]
│   │       └── ChildTask[] (inline)
│   └── NewTaskInput
├── #columns
│   └── DayColumn[]       — one per visible week day
│       ├── TaskSection[]
│       │   └── TaskRow[]
│       └── NewTaskInput
│       └── NotesPopover
├── DoneLog               — slide-up drawer, past 30 days
└── Toast                 — global error/confirmation notifications
```

## Major Flows

### Week Navigation
- `appState.weekOffset` (integer) drives `getWeekDays(offset)` → `WeekDay[]`
- `hidePast` (localStorage) filters out past days from the column list
- Today is always highlighted via `WeekDay.today`; past days via `WeekDay.past`
- Weekend columns (Sat/Sun) render at 70% width with a muted background

### Add Task
1. `NewTaskInput` parses terse syntax: title, optional `**` for star, optional `1h`/`30m` duration
2. On submit → `appState.addTask(filename, rawLine, category)`
3. State writes the file and refreshes cache → Svelte re-renders

### Drag and Drop
- Uses `svelte-dnd-action`
- **Within a column**: reorder tasks → `appState.reorderFileTasks()`
- **Across columns**: move task to another day → `appState.moveTask()`
- **To backlog**: move task to `Backlog.md` → `appState.moveTask(task, 'Backlog.md')`
- **Category reorder**: drag on section headers → `appState.reorderFileCategories()`
- External drag state tracked in `+page.svelte` and passed down as `externalDragTask` prop

### Inline Edit
- Double-click task title → `TaskRow` enters edit mode (`$state editing`)
- On blur/enter → `appState.editTaskTitle(task, newTitle)`

### Delete Confirmation
- Type "del" in the confirmation input before destructive actions (task delete, category delete)

## Important Abstractions

- **`TaskSection`** — shared between `DayColumn` and `BacklogRail`; renders one H1 category group with fold, drag handle, and delete controls
- **`TaskRow`** — single task with all interaction affordances; color-coded left border when subtasks exist
- **`WeekDay`** — data object from `lib/dates.ts`; drives column identity, labels, and styling decisions

## State Reactivity

All components read from `appState` (a Svelte 5 `$state` object). Writing to disk via any action invalidates the relevant cache entry and triggers a re-render automatically. Components never subscribe to stores or manage their own data fetching.

## Dependencies

- `svelte-dnd-action` — drag-and-drop
- `lib/state.svelte.ts` — all reads and mutations
- `lib/dates.ts` — week day computation
- `lib/ui/foldState.ts` — category collapse persistence
- `lib/md/parse.ts` (indirectly, via state) — data shape

## Constraints

- No framework router is used beyond SvelteKit's single-page layout — the entire app is one route (`/`)
- No server-side data loading — `+page.ts` has no `load` function
- Chromium-only due to File System Access API

## Known Technical Debt

- `+page.svelte` is large; drag coordination logic (tracking `draggingTask`) could be extracted into a dedicated drag context
- `DayColumn` and `BacklogRail` share structural patterns that are partially but not fully unified via `TaskSection`
- `NewTaskInput` parser duplicates some logic from `lib/md/parse.ts` — duration and star extraction could share a utility
