# Alph-Planner

Weekly task planner PWA. Input tasks with estimates and priorities; output
a draggable weekly schedule.

`*` in the project name denotes planning mode - no code yet.

## Goals

- Capture tasks fast (one line, terse syntax)
- Auto-place sessions into a weekly grid by priority
- Re-plan by dragging
- Work offline, install to home screen
- Deploy to Vercel from day one (preview per branch)
- Stay file-based until sync or multi-device demands a real DB

## Non-goals (v1)

- Multi-user / sync
- Calendar integration (Google, iCal)
- Recurring tasks (deferred to v2)
- Mobile-first (responsive yes, but designed desktop-first)

## Task syntax

Single-line input parses into a task:

```
draft email .5h x2, p2
ship invoice 1h, p1
deep work 2h x3, p3
```

Grammar:

- `<title>` (free text up to first time token)
- `<estimate>` like `.5h`, `1h`, `90m`
- `xN` optional session count (default 1)
- `pN` priority 1-4 (default 3)

## Scheduler

Greedy, priority-first:

1. Sort tasks by priority (p1 first), then by total hours desc.
2. For each task, place each session into the earliest open slot.
3. Sessions of the same task spread across days when possible (no two
   sessions of the same task in the same day unless no other day fits).
4. Respect per-day hour caps and time block-offs.
5. Anything that doesn't fit lands in the **Unscheduled** list.
6. Manual action: "Roll unscheduled to next week" - copies remaining
   sessions to the next week's schedule.
7. Manual action: "Compress day" - lets the user temporarily extend a
   day's hour cap to absorb overflow, with a warning.

## UI

Three regions:

1. **Inbox** - text input + parsed task list (top or left rail)
2. **Week grid** - 7 columns (Mon-Sun), rows are time slots. Sessions
   render as draggable blocks.
3. **Unscheduled** - sidebar / drawer for overflow.

Interactions:

- Drag a session block within the grid to move it.
- Drag from Unscheduled into the grid to schedule it.
- Drag out of the grid to unschedule.
- Click a block to edit / split / delete.
- Keyboard: `n` new task, `enter` submit, arrow keys to navigate grid.

## Configuration

Stored in the same JSON record as the schedule.

### Weekdays vs weekends

Weekdays and weekends are configured as **two separate blocks**, with a
master toggle for weekends.

- **Weekdays** (Mon-Fri): per-day hour caps and a shared day window.
- **Weekends** (Sat, Sun): separately toggleable. When off, weekends
  are zero-hour and the grid renders them collapsed. When on, they get
  their own per-day hour caps and day window (typically narrower).

This makes the common cases easy:

- "I don't work weekends" - leave weekends off, grid is 5 columns.
- "Saturday morning only" - weekends on, Sat = 3h with a 09:00-12:00
  window, Sun = 0h.

### Other config

- Default session granularity (e.g. 30m)
- Block-offs: recurring (e.g. lunch every weekday 12-1) or one-off
  (e.g. dentist Wed 3-4)

## Data model (JSON)

One file per week, plus a global config file. File-based until a real
DB is justified.

```json
// config.json
{
  "version": 1,
  "weekdays": {
    "enabled": true,
    "hoursPerDay": { "mon": 6, "tue": 6, "wed": 6, "thu": 6, "fri": 4 },
    "dayWindow": { "start": "09:00", "end": "18:00" }
  },
  "weekends": {
    "enabled": false,
    "hoursPerDay": { "sat": 0, "sun": 0 },
    "dayWindow": { "start": "10:00", "end": "14:00" }
  },
  "granularityMinutes": 30,
  "blockOffs": [
    { "id": "bo_lunch", "recurring": "weekday", "start": "12:00", "end": "13:00", "label": "lunch" },
    { "id": "bo_xx", "date": "2026-05-06", "start": "15:00", "end": "16:00", "label": "dentist" }
  ]
}
```

```json
// week-2026-W19.json
{
  "version": 1,
  "weekStart": "2026-05-04",
  "tasks": [
    {
      "id": "t_01",
      "title": "draft email",
      "sessionMinutes": 30,
      "sessionsTotal": 2,
      "sessionsDone": 0,
      "priority": 2,
      "createdAt": "2026-05-05T10:00:00Z",
      "notes": ""
    }
  ],
  "sessions": [
    { "id": "s_01", "taskId": "t_01", "day": "mon", "start": "09:00", "end": "09:30", "status": "scheduled" },
    { "id": "s_02", "taskId": "t_01", "day": "wed", "start": "09:00", "end": "09:30", "status": "scheduled" }
  ],
  "unscheduled": []
}
```

When to migrate to Postgres:

- Multi-device sync needed
- More than one user
- History queries beyond "last few weeks"
- Until then: JSON in localStorage, with import / export to disk.

## Stack

Recommended: **SvelteKit + TypeScript + svelte-dnd-action**

- SvelteKit has first-class PWA story (vite-plugin-pwa)
- Svelte produces smaller bundles, less boilerplate
- svelte-dnd-action is simple and solid for this use case
- `@sveltejs/adapter-vercel` makes Vercel deploy zero-config

Alternative: Vite + React + TS + dnd-kit if you'd rather stay in React
(works on Vercel too, just different adapter).

Other deps:

- vite-plugin-pwa for service worker + manifest
- date-fns for date math
- zod for parsing the task input grammar safely
- (optional) idb-keyval for cleaner localStorage

No backend in v1. JSON read/write through `localStorage` plus an
import/export pair using the File System Access API where available.

## Deployment - Vercel from day one

- GitHub repo connected to a Vercel project on commit 1.
- Adapter: `@sveltejs/adapter-vercel` (or `@vercel/static-build` for
  the React option).
- Every PR gets a preview URL automatically.
- `main` deploys to production.
- Static site only in v1 (no API routes), so the Vercel build is just
  a static export. Costs nothing on the Hobby plan.
- Add a `vercel.json` only if we need custom headers (cache, CSP).

When the data layer moves off localStorage:

- Add Vercel KV or Postgres at that point.
- Until then, no env vars, no secrets.

## Build estimate

**~16 - 23 hours for v1**, broken down:

- 1.5h - Project setup, PWA manifest, service worker, base layout
- 1h - Vercel project, adapter, preview deploy verified on commit 1
- 2h - Task input parser (grammar + zod schema + tests)
- 1.5h - Task list / inbox UI
- 3h - Scheduler algorithm + tests
- 4h - Week grid view + drag-and-drop
- 2h - Config UI (weekday block, weekend block w/ toggle, block-offs)
- 1h - Unscheduled drawer + roll-to-next-week
- 1h - Import / export JSON
- 2h - Polish, offline test, install flow, Lighthouse pass
- 2h buffer

The Vercel-from-day-one and weekend-as-separate-block additions add
roughly 1 - 1.5h vs the original estimate.

## Open questions

- Should the week start on Mon or Sun (configurable)?
- Should completed sessions persist for a "what I did" view, or be cleared weekly?
- Mobile target: usable read-only, or full editing?
- Do block-offs count against `hoursPerDay`, or are they additional?
- Snap-to-grid only, or free placement at the minute level?

## Milestones

1. **M1 - Capture + parse**: input box, task list, JSON persistence,
   first Vercel preview deploy live.
2. **M2 - Scheduler v0**: priority-greedy placement into a static week.
3. **M3 - Drag**: rearrange in the grid, drag to/from Unscheduled.
4. **M4 - Config**: weekday + weekend blocks, block-offs.
5. **M5 - PWA polish**: offline, install, import/export, Lighthouse.
