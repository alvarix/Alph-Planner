# Spec: Remote Sync

Status: draft, not implemented
Author: handoff doc, 2026-05-06
Owner: TBD

## Problem

State lives in a single `localStorage` key (`alph-planner-v1`) per
browser. Today the only path off-device is Config -> Export JSON ->
Import JSON on the other device. That works for backup but fails the
moment two devices are in active use, and it doesn't survive clearing
site data.

The SPEC names three triggers for moving off `localStorage`:

1. Multi-device sync needed
2. More than one user
3. History queries beyond "last few weeks"

(1) is the live one. (2) and (3) are not on the table yet.

## Goal

Replace manual export/import with an always-on remote store such that
opening the app on any device shows the same state within a few seconds,
without the user thinking about files. Keep `localStorage` as the
offline-first source so the app still works on a plane.

## Non-goals

- Multi-user collaboration on the same week.
- Real-time concurrent editing (CRDT, OT).
- Versioned history beyond a small recent window.
- Migrating away from the existing JSON shape.

## Options considered

The data is small: ~5-25 KB per week, ~1.3 MB / 250 KB gzipped for a
year of weekly history (see `Assess export` notes). Any of these can
hold it comfortably; the difference is operational cost and what the
app gets for free.

### A. Keep export/import, polish only

Add iCloud Drive / Dropbox folder watch, or a "sync via GitHub Gist"
button. Zero infra. User still has to think about it. Doesn't solve
multi-device for someone who wants to open the laptop and just see
yesterday's state.

- Effort: ~1-2 h.
- Verdict: Lowest effort, lowest payoff. Skip unless we abandon sync.

### B. Neon (serverless Postgres)

Free tier (0.5 GB), Vercel-native, branching for previews. We get a
real SQL store but nothing else: auth, client SDK, realtime — all
DIY.

- Pros: Zero ops, scales to multi-user later, SQL queries unlock the
  history-view milestone, integrates with `@vercel/postgres` and
  preview branches.
- Cons: We have to build (a) an auth boundary so a stranger hitting
  the deployed URL can't read our tasks, (b) a write API route, (c)
  a client poll/push layer. That's ~6-8 h of glue we don't need yet.
- Effort: ~8-10 h end-to-end.

### C. PocketBase

Single Go binary: SQLite store, REST + realtime API, built-in auth,
admin UI. Self-host on Fly.io / Railway / a VPS.

- Pros: Auth, schema, realtime sync, and an admin panel come in the
  box. The JS SDK (`pocketbase`) is ~10 KB and matches our shape (one
  collection of "weeks", one row of JSON per week). The realtime
  subscription means "open laptop, see phone's edits" without polling.
- Cons: We have to host it. Free tiers exist (Fly.io 256 MB VM is
  enough) but it's a moving target — needs occasional updates,
  backups, TLS. Slightly more day-2 burden than a managed DB.
- Effort: ~4-6 h end-to-end.

### D. Supabase (mentioned for completeness, not asked)

Postgres + auth + realtime + storage, managed. Free tier 500 MB.
Effectively "Neon plus what Neon makes you build."

- Pros: Same realtime / auth story as PocketBase, no self-hosting.
- Cons: Heavier dependency (Supabase JS), more service surface than
  this app needs.
- Effort: ~4-5 h end-to-end.

## Recommendation

**Step 1 (this spec): PocketBase**, scoped to single-user.

Why over Neon: realtime + auth are the actual blockers, not SQL. Neon
hands us a database but leaves us building the same auth and sync
plumbing. PocketBase gives us all three in one binary, and our data
fits its sweet spot (small, document-shaped, single-user).

Why over Supabase: Supabase would also work; we pick PocketBase because
(a) it's self-contained, (b) the SDK is smaller, (c) the data never
leaves a host we control. If self-hosting becomes annoying, swap to
Supabase — the surface is similar.

Why not stay on export/import: the user has to think about it. The
whole point of (1) above is "don't make me think."

## Architecture

### Data model

One PocketBase collection: `weeks`.

| field | type | note |
|---|---|---|
| `id` | text (auto) | PB record id |
| `userId` | relation -> users | owner; required |
| `weekStart` | text | ISO date `YYYY-MM-DD`, unique per user |
| `payload` | json | the existing export shape |
| `updated` | autodate | for last-write-wins |

Indexed: `(userId, weekStart)` unique.

`payload` matches the current `exportJSON()` output verbatim:

```json
{
  "tasks": [...],
  "sessions": [...],
  "unscheduled": [...],
  "done": [...],
  "config": {...}
}
```

(Fix `exportJSON` to include `done` first — it omits it today, see
`src/lib/persistence.ts:107`.)

A second collection `app_config` holds the global config (one row per
user) so `weeks.payload.config` becomes redundant. Open question
below.

### Auth

PocketBase built-in email + password. Single user (the dev) creates an
account in the admin UI; the app prompts for credentials on first run
and stores the token in `localStorage`.

No public signups. Disable the registration endpoint in PB settings.

### Client integration

New file `src/lib/sync.ts`:

```ts
import PocketBase from 'pocketbase';

const pb = new PocketBase(import.meta.env.VITE_PB_URL);

/** Push the current week to the remote store. Last-write-wins. */
export async function pushWeek(weekStart: string, payload: unknown) {...}

/** Fetch a week's payload, or null if it doesn't exist. */
export async function pullWeek(weekStart: string) {...}

/** Subscribe to real-time updates from other devices. */
export function subscribeWeek(weekStart: string, cb: (p: unknown) => void) {...}
```

Wire into the persistence `$effect` next to `saveState(app)`:

```ts
$effect(() => {
  ...existing reactivity reads...
  saveState(app);
  postSnapshot(app);            // dev only
  pushWeek(currentWeekStart(), exportShape(app)); // debounced 1000 ms
});
```

On app load, after `loadState()`:

1. Pull the remote payload for the current week.
2. If remote `updated` > local last-saved timestamp, apply remote and
   overwrite localStorage.
3. Else push local up.
4. Subscribe to realtime events for the current week; apply on receipt
   if the event's `updated` is newer than what we just wrote.

### Conflict resolution

Last-write-wins by `updated` timestamp on the remote row. Acceptable
because:

- Single user, two devices rarely edit the same week within seconds.
- The realtime subscription pulls remote changes within ~1 s of a
  push, so the second device's `pushWeek` call almost always reads a
  fresh local state before mutating.
- The app already has the dev-mode snapshot history as a recovery net.

If we hit observable data loss in practice, upgrade to per-collection
diffing (tasks/sessions/done as separate rows) — but that's a v2
migration, not v1.

### Hosting

Fly.io free tier, single 256 MB VM, persistent volume for SQLite.
`fly.toml` + `Dockerfile` (PB ships an official image). Backup is a
nightly `litestream` push to S3 or just `fly ssh sftp get pb_data.db`.

Cost: $0 on Fly.io free tier.

### Environment

| var | scope | example |
|---|---|---|
| `VITE_PB_URL` | client | `https://alph-planner-pb.fly.dev` |

No server-side secrets in the SvelteKit app — auth happens client-side
via the PocketBase JS SDK.

## Migration plan

1. Ship the `done` fix to `exportJSON`.
2. Stand up PocketBase locally with the schema above.
3. Write `src/lib/sync.ts`.
4. Wire push/pull/subscribe into `+page.svelte`.
5. Add a sign-in panel to the config drawer (email + password fields,
   "Sign out" button).
6. One-shot migration: when a user signs in for the first time and the
   remote `weeks` table has zero rows for them, push every existing
   localStorage week (today only the current week) up.
7. Deploy PocketBase to Fly.io.
8. Set `VITE_PB_URL` in Vercel.
9. Keep export/import wired up as a fallback.

## Implementation steps

1. **Fix `exportJSON` to include `done`.** (`src/lib/persistence.ts:107`).
2. **Spin up PocketBase locally.** `./pocketbase serve`. Create the
   `weeks` collection with the schema above. Create one user.
3. **Add the SDK.** `npm i pocketbase`.
4. **Build `src/lib/sync.ts`.** Functions: `signIn`, `signOut`,
   `pushWeek`, `pullWeek`, `subscribeWeek`, `currentUser`.
5. **Wire push.** Add to the persistence `$effect` with a 1 s debounce.
6. **Wire pull + subscribe.** In `+page.svelte` `onMount`, after
   `loadState()`.
7. **Sign-in UI.** A small panel in the config drawer. Hidden behind a
   "Sync" disclosure to keep the existing UI clean.
8. **Local end-to-end test.** Sign in on two browser profiles, edit a
   task in one, confirm it appears in the other within ~2 s.
9. **Deploy PB to Fly.io.** Use the official image, mount a volume.
10. **Set `VITE_PB_URL`** on Vercel. Redeploy.
11. **Smoke test on production** with two real devices.
12. **Document.** Add a `## Sync` section to README and a
    `## Recovering from sync conflicts` note pointing back to the
    dev-mode snapshot trick.

## Tests

- Unit: `sync.ts` push/pull serialize the same shape as `exportJSON`.
  Use `vi.fn()` to mock the PB SDK.
- Integration (Playwright):
  - Sign in, edit a task, reload, expect the task to persist.
  - Two contexts (`browser.newContext()` x 2) signed in as the same
    user. Edit in A, expect B to receive the realtime update within 3 s.
- Manual:
  - Airplane-mode test: turn off network, edit, turn on, expect the
    edit to appear remotely within a few seconds.
  - Conflict test: edit in A while B is offline, edit different task
    in B, bring B online, expect last-write-wins on the merged row
    (A's edit may be lost — note this in the docs).

## Security considerations

- **Auth tokens in localStorage**: standard for PB SDK. XSS would
  expose them. The app has no third-party scripts; CSP could harden
  this but is out of scope.
- **Public PB URL**: anyone can hit it. Disable signups in PB admin so
  only pre-provisioned users can authenticate.
- **HTTPS only**: Fly.io provides TLS by default. Refuse `http://`
  URLs in `VITE_PB_URL` validation.
- **Backup**: SQLite file on a single VM is a single point of failure.
  `litestream` to S3 or weekly `fly ssh` snapshot.

## Performance considerations

- Push is debounced 1 s; matches our `localStorage` debounce.
- Payload is < 25 KB; no need for diffing or partial updates.
- Realtime subscription is a single SSE connection; trivial overhead.
- Cold-start on Fly.io free VM: ~2 s on first request after idle.
  Acceptable for a personal planner.

## Risks and tradeoffs

- **Self-hosting day-2**: PB updates, TLS cert renewal (auto on Fly.io),
  volume backups. ~30 min/quarter.
- **Last-write-wins data loss**: real but bounded — would only bite us
  if two devices edit the same week within the debounce window. The
  dev-mode snapshot directory is the recovery net.
- **Vendor lock-in**: low. PB exports to JSON; the data shape is ours.
- **Adds a service to the deploy story** that didn't exist before.
  Counter: it's the same complexity we'd add for any sync option.

## Open questions

- Split `config` into its own collection (`app_config`) or keep it on
  every week's payload? Splitting is cleaner but means two writes per
  edit. Recommend: keep on payload for v1, split when config drift
  between weeks becomes painful.
- Should the dev `snapshots/` mechanism keep running once remote sync
  is live? Yes — different concern (in-session undo vs cross-device).
- Should we expose "Sign out and clear local data" as a single button?
  Useful for handing the laptop to someone. Defer.
- Which week ID format: ISO week (`2026-W19`) or week-start date
  (`2026-05-04`)? SPEC uses both. Recommend week-start date — easier
  to sort, no week-numbering edge cases.

## Dependencies

- New: `pocketbase` (JS SDK, ~10 KB gzipped).
- New runtime: PocketBase server on Fly.io.
- Existing: SvelteKit, Vite, the current `persistence.ts` shape.

## Definition of done

- Two devices signed in as the same user see each other's edits within
  ~3 s.
- Offline edits are pushed on reconnect.
- Sign-in UI lives in the config drawer; sign-out clears the token but
  preserves localStorage for offline use.
- README has a `## Sync` section.
- Existing Playwright suite passes; new sync tests pass.
- PB is deployed to Fly.io with a volume and a documented backup
  procedure.

## Related work

- `docs/spec-dev-state-history.md` — dev-mode snapshot history. Stays
  in place; complementary, not replaced.
- `src/lib/persistence.ts` — `exportJSON` needs `done` added before
  this lands.
- README "Data" section — needs a `## Sync` subsection on completion.
