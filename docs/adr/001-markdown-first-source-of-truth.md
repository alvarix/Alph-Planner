# ADR 001: Markdown Files as the Source of Truth

## Status

Accepted (implemented in v1.0.0, 2026-05-12)

## Context

The v0 version used an in-app data model (grid-based time slots) with no direct connection to the user's Markdown files. Users who kept daily notes in Obsidian had to maintain two separate systems. The postmortem (`docs/postmortem-grid-version.md`) identified this as the core failure: the app was competing with, not complementing, the user's existing workflow.

The user's daily `.md` files represent their actual workflow artifact. Any planning tool that doesn't operate on those files adds friction rather than reducing it.

## Decision

The user's local `.md` files are the **only** source of truth. The app reads, parses, mutates, and writes these files directly. There is no separate database, no import/export step, and no proprietary format.

The app adopts a **subset** of standard Markdown:
- `# Heading` for category grouping (H1 only)
- `- [ ] task` / `- [x] task` for task items (GFM checkbox syntax)
- Indented `  - [ ] subtask` for child tasks
- Inline suffixes for metadata: `**title**` for starred, `1h`/`30m` for estimates

All other Markdown content (prose, frontmatter, horizontal rules, notes below `---`) is preserved byte-identical on every write.

## Consequences

**Positive:**
- Files remain valid, readable Markdown in any editor (Obsidian, VS Code, etc.)
- No data migration required — users' existing daily notes work immediately
- Real-time sync with Obsidian via `window.focus` refresh
- No backend, no database, no cloud dependency

**Negative:**
- Structural changes to the file (e.g., user renames a category in Obsidian) can shift line numbers, causing stale `lineRange` references in the in-memory cache — mitigated by always refreshing before write
- The app cannot store metadata that doesn't fit in the Markdown format without risking breaking other tools
- Adding new task fields requires extending both the parser and serializer in a backward-compatible way

## Tradeoffs

- A dedicated database would allow richer querying, history, and multi-device sync — but would require the user to manage two representations of their tasks
- The line-number targeting approach for mutations is fragile compared to ID-based approaches, but IDs embedded in Markdown would break interoperability with other editors
