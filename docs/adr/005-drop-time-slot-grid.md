# ADR 005: Remove Time-Slot Grid (v0 → v1)

## Status

Accepted (v1.0.0, 2026-05-12)

## Context

v0 of the app used a 30-minute time-slot grid — a traditional calendar-style scheduler where tasks were dragged into time blocks. The postmortem (`docs/postmortem-grid-version.md`) documented why this was abandoned:

- The grid imposed a rigid time structure that didn't match how the user actually planned
- Dragging tasks into specific time slots was friction-heavy for a simple daily task list
- The visual model diverged significantly from the Markdown file format — a 9:00 AM slot has no natural Markdown representation
- Maintaining grid state alongside file content created synchronization complexity

## Decision

Remove the time-slot grid entirely. Replace with a **plain column layout** where each day is a vertical list of tasks grouped by category (H1 heading). Tasks have an optional duration estimate (stored as a suffix in the task line) but are not scheduled to specific times.

## Consequences

**Positive:**
- The UI directly mirrors the Markdown file structure — what you see is what's in the file
- No scheduling overhead — users organize by category, not by time slot
- Duration estimates (`1h`, `30m`) provide time awareness without forcing time-slot assignment
- Dramatically simpler component model

**Negative:**
- No visual representation of time of day — users who want to schedule specific times must use a separate calendar tool
- Lost feature: the grid provided a "how much is left in the day" visual overview via fill percentage

## Tradeoffs

- A hybrid approach (optional time slots) was considered but rejected — it would reintroduce the synchronization complexity and add UI surface area for a feature most usage didn't justify
- Duration estimates in the column header (total `Xh` per day) provide a lightweight time budget view without the grid

## Notes

The v0 codebase was archived rather than migrated — v1 is a complete rewrite. The decision is reflected in `docs/postmortem-grid-version.md`.
