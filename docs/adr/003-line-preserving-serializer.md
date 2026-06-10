# ADR 003: Line-Preserving Serializer for Markdown Write-back

## Status

Accepted

## Context

When the app mutates a task (toggle, edit, reorder, delete), it must write the change back to the user's `.md` file. Two approaches were possible:

1. **Regenerate the file** from the in-memory `Task[]` model — discard all other content and reconstruct Markdown from scratch
2. **Mutate only the targeted line(s)** — read the raw file, change the minimum necessary, write back

## Decision

Use a **line-preserving serializer**. Every write operation:
1. Reads the current raw file content
2. Splits into lines
3. Applies the mutation to only the targeted line(s) (identified by `lineRange` or `lineIndex`)
4. Joins lines and writes back

Lines that are not part of the mutation pass through byte-identical: prose paragraphs, blank lines, frontmatter, comments, horizontal rules, and notes below `---` are never touched.

## Consequences

**Positive:**
- Users can freely mix task lists with prose, links, and other Markdown in their daily files — the app will not destroy that content
- Notes below the `---` divider are fully preserved
- Compatible with Obsidian and other editors — their metadata (frontmatter, links, embeds) survives app writes
- Minimal diff when viewing file history in git

**Negative:**
- Tasks are identified by `lineRange` (start/end line indices), not by a stable ID. If the file is modified externally between a read and a write, the line numbers may be stale. The app mitigates this by always re-reading the file immediately before applying a mutation.
- Reorder operations (tasks, categories) must reconstruct line segments rather than simply moving array elements — more complex implementation in `serialize.ts`
- The serializer cannot normalize formatting inconsistencies in user files

## Tradeoffs

- Regenerating from the in-memory model would be simpler and eliminate the stale-line-number risk, but would strip all non-task content from the file — unacceptable for users who keep notes in their daily files
- A stable task ID (e.g., a UUID in an HTML comment) would eliminate the stale-line risk while preserving content, but any ID format embedded in Markdown would clutter the file and potentially break other tools

## Implementation Notes

- `lib/md/serialize.ts` — all serializer functions
- `lib/md/parse.ts` — parser populates `lineRange` and `lineIndex` fields used for targeting
- The invariant: **line count before write = line count after write** (except for add/delete operations, which add/remove exactly the expected number of lines)
