# Data Model

## Source of Truth

All task data lives in plain Markdown files on the user's local disk. There is no database. The in-memory cache in `appState` is a read-through cache that is invalidated and rebuilt from disk after every write.

## File Format

### Daily File (`YYYY-MM-DD.md`)

```markdown
# Category Name

- [ ] Unchecked task
- [x] Completed task
- [ ] **Starred task** 1h
  - [ ] Subtask
  - [x] Done subtask
- [ ] Task with estimate 30m

# Another Category

- [ ] Task in second category

---
Freeform notes below the divider
```

### Backlog File (`Backlog.md`)

Same format as daily files, but tasks have no associated date. Used for tasks without a deadline.

### Defaults File (`Defaults.md`)

```markdown
# Weekly
## Category
- [ ] Recurring weekly task

# Monthly Start
## Category
- [ ] Task added at start of month

# Monthly End
## Category
- [ ] Task added at end of month
```

Cadence sections: `Weekly`, `Monthly Start`, `Monthly End`. Applied idempotently via `<!-- defaults: <key> -->` comments inserted into daily files.

## TypeScript Interfaces

Defined in `src/lib/types.ts`.

### `Task`

```typescript
interface Task {
  file: string;                    // "2026-05-12.md" | "Backlog.md"
  date: string | null;             // ISO date string or null for Backlog
  lineRange: [number, number];     // [startLine, endLine], 0-based, inclusive
  category: string | null;         // H1 section name, null = uncategorized
  title: string;                   // Cleaned title (no ** or duration token)
  starred: boolean;                // true if wrapped in **...**
  estimateMin: number | null;      // Minutes (5–480), null if no estimate
  done: boolean;                   // [ ] vs [x]
  children: ChildTask[];
  raw: string;                     // Original task line for write-back
}
```

### `ChildTask`

```typescript
interface ChildTask {
  lineIndex: number;   // 0-based line index in file
  title: string;
  done: boolean;
  raw: string;         // Original line for write-back
}
```

## Parsing Rules

Implemented in `lib/md/parse.ts`:

| Element | Regex | Notes |
|---------|-------|-------|
| Category | `^#\s+(.+)` | H1 only |
| Task | `^(\s*)-\s*\[([ xX])\]\s*(.*)` | Indent = 0 for parent, > 0 for child |
| Duration | `\s+(\d*\.?\d+)\s*(h\|m)$` | Stripped from title before storage |
| Starred | `^\*\*(.+)\*\*$` | Applied after duration strip |

Lines that do not match any pattern are preserved as-is during serialization.

## Serialization Rules

Implemented in `lib/md/serialize.ts`:

- **Only the targeted line(s) change** — all other lines pass through byte-identical
- Tasks are identified by `lineRange`, not by title
- Subtasks are identified by `lineIndex`
- Appended tasks go at the end of their category block (before the next H1 or end of file)
- New categories are appended at the end of file with a blank line separator

## In-Memory Cache

`appState.cache` maps `filename → Task[]`. Cache entries are rebuilt from disk on:
- Initial app load
- After every write operation
- On `window.focus` (to pick up external edits)

`appState.fileHeaders` maps `filename → string[]` (ordered H1 category names).
`appState.notesCache` maps `filename → NotesEntry` (text below the `---` divider).

## Duration Encoding

Duration estimates are stored inline in the task title as a suffix token:
- `1h` = 60 minutes
- `30m` = 30 minutes
- `1.5h` = 90 minutes

Range: 5–480 minutes. Values outside this range are ignored by the parser.

## Starred Encoding

A starred task wraps its title in `**...**`:
```
- [ ] **This task is starred** 1h
```
The `**` markers are stripped for the in-memory `title` field and re-added on write.

## Notes

The `---` divider in a daily file separates task content from freeform notes. Everything below `---` is treated as opaque text. The parser extracts it; the serializer preserves it. Notes are never parsed as tasks.
