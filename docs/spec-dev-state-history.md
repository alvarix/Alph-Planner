# Spec: Dev-Mode State History

Status: draft, not implemented
Author: handoff doc, 2026-05-06
Owner: TBD

## Problem

The app persists its entire state to a single `localStorage` key
(`alph-planner-v1`). Every reactive change overwrites the prior value
with no history. We just shipped a one-deep `alph-planner-v1-snapshot`
key, but it only protects against the next destructive op — not against
a sequence of unintended overwrites. There is no way to recover state
from earlier in a session if a bug or misclick mutates it.

## Goal

In dev mode, capture every persisted state change to a timestamped file
on disk. Make recovery a copy-paste-and-reload operation. Keep the
mechanism completely off in production.

## Non-goals

- Replacing `localStorage` as the primary store.
- Production / Vercel persistence.
- Multi-user, multi-device, or cloud sync.
- Visual undo / redo UI (tracked separately).
- Replay / timeline UI (tracked separately).

## Approach

Add a SvelteKit `+server.ts` endpoint mounted only when running under
`vite dev`. After each `saveState()` call in the browser, fire a
debounced `POST` of the current state to that endpoint. The endpoint
writes a timestamped JSON file under `._-/snapshots/`. Retention is
capped to the most recent N files; older files are pruned on each write.

Recovery: the user picks a file by timestamp and pastes its contents
into `localStorage` via devtools.

## Architecture

### Server endpoint

Path: `src/routes/api/snapshot/+server.ts`

```ts
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(process.cwd(), '._-', 'snapshots');
const KEEP = 500;

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) return new Response(null, { status: 405 });
  const body = await request.text();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(join(DIR, `${ts}.json`), body, 'utf-8');
  await prune();
  return new Response(null, { status: 204 });
};

async function prune() {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.json')).sort();
  const excess = files.length - KEEP;
  if (excess > 0) {
    await Promise.all(files.slice(0, excess).map(f => unlink(join(DIR, f))));
  }
}
```

Strict `dev` gating: returns 405 in `vite preview` and production.

The endpoint must ensure the directory exists. Use `mkdir({ recursive: true })`
on first import or before each write — implementation detail.

### Client

In `src/lib/persistence.ts`, add:

```ts
let _snapTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Send a copy of the current state to the dev-only snapshot endpoint.
 * Debounced 500ms. No-op outside dev. Fire-and-forget.
 *
 * @param state - The app state object
 */
export function postSnapshot(state: AppSnapshot): void {
  if (!import.meta.env.DEV) return;
  if (_snapTimer) clearTimeout(_snapTimer);
  _snapTimer = setTimeout(() => {
    const data = JSON.stringify({
      tasks: state.tasks,
      sessions: state.sessions,
      unscheduled: state.unscheduled,
      done: state.done,
      config: state.config
    });
    fetch('/api/snapshot', { method: 'POST', body: data, headers: { 'content-type': 'application/json' } })
      .catch(() => {});
  }, 500);
}
```

Wire into the existing persistence `$effect` in `src/routes/+page.svelte`
right after the `saveState(app)` call:

```ts
$effect(() => {
  void app.tasks.length;
  void app.sessions.length;
  void app.unscheduled.length;
  void app.done.length;
  void app.config;
  saveState(app);
  postSnapshot(app);
});
```

### Filesystem layout

```
._-/snapshots/
  2026-05-06T13-42-03-512Z.json
  2026-05-06T13-43-11-008Z.json
  ...
```

File contents: same JSON shape as `STORE_KEY`, no extra metadata. The
filename carries the timestamp.

### gitignore

Add to `.gitignore`:

```
._-/snapshots/
```

(Or `._-/` if other internal artifacts will live alongside snapshots.
That choice depends on whether plan/done/spec markdowns are tracked.
Today, none are tracked — `.claude/` is also untracked. Recommend
keeping `._-/` itself untracked for now and revisiting once the
convention firms up.)

## API contract

```
POST /api/snapshot
Content-Type: application/json
Body: { tasks: Task[], sessions: Session[], unscheduled: UnscheduledSession[], done: DoneSession[], config: Config }

Responses:
  204 No Content   — written
  405              — production / preview build
  500              — write failure (caller ignores)
```

No response body on any status.

## Recovery flow

Manual today:

1. List recent snapshots: `ls -t ._-/snapshots/ | head -20`
2. Pick the desired timestamp.
3. Copy its contents: `pbcopy < ._-/snapshots/<file>.json`
4. In browser devtools console: `localStorage.setItem('alph-planner-v1', /* paste */)`
5. Reload the page.

Future ergonomic improvement (out of scope here): an `npm run restore -- <timestamp>`
script that prints a self-contained `localStorage.setItem(...)` line ready
to paste, or writes to a sentinel file that the app picks up on next load.

## Implementation steps

1. Create `src/routes/api/snapshot/+server.ts` with POST handler, dir
   bootstrap, retention prune.
2. Add `postSnapshot()` to `src/lib/persistence.ts`.
3. Wire into `+page.svelte` $effect.
4. Add `._-/snapshots/` to `.gitignore`.
5. Smoke test: with `npm run dev` running, edit a task — confirm a JSON
   file appears under `._-/snapshots/`. Make >500 edits (or lower the
   cap during test) and confirm older files are pruned.
6. Test recovery: edit state, copy a recent file's contents into
   localStorage, reload — confirm restored.
7. Document recovery flow in `README.md` under a new
   "Dev: state history & recovery" section.
8. Confirm production build excludes the endpoint: `npm run build && npm run preview`,
   then `curl -X POST localhost:4173/api/snapshot -d '{}'` should 405.

## Tests

- Unit-style: not strictly necessary; the endpoint is a few lines.
- Integration: a Playwright test that, in dev mode only, asserts the
  snapshot endpoint returns 204 on POST.
- Manual: production-mode test that the endpoint 405s.

## Risks and tradeoffs

- **Disk usage**: ~5–20 KB × 500 files ≈ 2.5–10 MB. Negligible.
- **Write race on shutdown**: a partial JSON file is possible if the
  process is killed mid-write. Mitigate with write-to-temp + atomic
  rename if it matters in practice.
- **Network noise during typing**: addressed by 500ms debounce.
- **Snapshot does not include drag/transient UI state**: by design —
  we only capture the persisted shape.
- **`._-/snapshots/` outside the repo on a worktree**: irrelevant since
  the dir is gitignored anyway.

## Open questions

- Retention strategy: rolling N (current proposal) vs daily-keep-last-N-of-day?
  Daily rotation gives broader timeline at less granularity. Recommend
  rolling-500 to start; revisit if files prove insufficient.
- Should the snapshot include `weekOffset` and other ephemeral state?
  Currently no — matching `saveState`. If recovery needs to put the user
  back on a specific week, add it.
- Should we expose a "Snapshot now" button in the config drawer that
  forces a flush regardless of debounce? Useful for marking known-good
  states. Defer to a follow-up.

## Dependencies

- Existing: SvelteKit ≥ 2, Node 18+ (built-in `node:fs/promises`).
- New: none.

## Definition of done

- Endpoint mounts only under `vite dev`.
- Every persisted state change produces a JSON file within ≤ 600 ms.
- Older files are pruned past the retention cap.
- Production / preview builds reject POST with 405.
- README has a "Dev: state history & recovery" section with the manual
  recovery steps.
- No regressions in existing Playwright suite.

## Related work

- Already shipped: non-destructive `applyConfig`, `addTasks`, single-task
  re-schedule path; one-deep `alph-planner-v1-snapshot` key for the
  Auto-schedule button. See `src/lib/store.svelte.ts`,
  `src/lib/scheduler.ts`, `src/lib/persistence.ts`.
- Future: visual Undo / Redo, "Restore from snapshot" config-drawer UI,
  cloud sync.
