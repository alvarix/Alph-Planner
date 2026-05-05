# Alph-Planner

A weekly task planner PWA. Type tasks in a terse syntax, auto-schedule them into a 7-column week grid, drag sessions between slots, and manage overflow with an Unscheduled rail.

## Task syntax

```
draft email .5h x2, p2
ship invoice 1h, p1
deep work 2h x3, p3
stand-up 15m
```

- **title** — free text before the first duration token
- **duration** — `1h`, `.5h`, `90m` (15 min – 8 hours)
- **xN** — session count, default 1 (e.g. `x3` = three separate sessions)
- **pN** — priority 1-4, default 3 (p1 = highest, p4 = lowest)

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `n` | Focus task input |
| `Cmd+Enter` | Add tasks from input |

## Local dev

```sh
npm install
npm run dev
```

## Stack

- SvelteKit 5 (runes mode)
- Vite + vite-plugin-pwa
- adapter-vercel
- date-fns, zod
- Native HTML5 drag-and-drop

## Deploy

Push to a Vercel-connected repo. The adapter-vercel adapter handles SSR/serverless automatically. No environment variables required for v1.

## Data model

All state is stored in `localStorage` under the key `alph-v0`. Use the Config drawer to export/import JSON backups. No server-side persistence in v1.

## Config

Open the gear icon (top right) to configure:
- Hours per day per weekday (used as slot capacity cap)
- Weekends toggle
- Block-offs: recurring (every weekday/weekend) or per-day time blocks (e.g. lunch, meetings)
