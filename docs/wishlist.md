# Feature Wishlist

Candidates deferred from v1. Each item has a size estimate and notes on scope.

Size key: XS <1h · S 1–2h · M 2–4h · L 4–8h · XL 8h+

Add items here instead of building them immediately when scope or value is unclear.
Strike through and link a commit when shipped.

---

## Scheduler

- [ ] **Roll to next week (real)** — S  
  Currently clears the overflow list with a toast. Real impl creates a new week record
  carrying unscheduled sessions forward. Needs week-file management.

- [ ] **Recurring tasks** — L  
  e.g. `standup 15m daily`. Requires a recurrence grammar and expansion logic before
  scheduling. Deferred to v2 per SPEC.

- [ ] **Compress day** — S  
  Temporarily extend a day's hour cap to absorb overflow, with a warning badge.
  Specified in SPEC; left out of v1 for scope.

- [ ] **Snap-to-grid vs free placement** — M  
  Currently snaps to 30-min slots. Free minute-level placement needs a finer grid and
  more complex overlap detection.

---

## Time & Navigation

- [ ] **Real week navigation** — M  
  Day headers are hardcoded to May 5–11 2026. Dynamic navigation requires computing the
  ISO week, aligning weather dates, and loading/saving per-week JSON records.

- [ ] **Week start config (Mon vs Sun)** — S  
  Depends on real week navigation being done first.

- [ ] **Completed-session history** — M  
  Currently done sessions are discarded. A history view ("what I did this week") needs
  a separate store and a summary UI.

---

## Input / Parser

- [ ] **Priority aliases** — XS  
  Accept `high` → p1, `med`/`medium` → p2, `low` → p3 alongside the numeric `pN` form.
  ~30 min parser change, zero config needed.

- [ ] **Configurable defaults** — S  
  Expose default priority (currently 3) and default session count (currently 1) as
  Config drawer settings. ~1h total.

- [ ] **Alternate duration formats** — S  
  e.g. `1:30` for 1h30m, `90` (bare number = minutes). Needs careful regex order to
  avoid ambiguity with other tokens.

- [ ] **Project / context tag** — M  
  e.g. `deep work 2h @research, p2`. Requires a tag store, filter UI, and
  color-coding on session blocks.

- [ ] **Import from external formats** — L per format  
  Markdown task lists (`- [ ] …`), Todoist CSV, Things 3 export. Each format needs
  its own adapter and field mapping UI.

---

## Config

- [ ] **Day window (start/end time)** — S  
  Config drawer already has the hour-cap fields; add start/end time selects so the grid
  renders only the working window (e.g. 9 am–6 pm is hardcoded today).

- [ ] **Granularity setting** — M  
  Currently fixed at 30-min slots. Making it configurable (15 / 30 / 60 min) affects
  the slot height, time labels, parser minimum, and DnD snap.

---

## Calendar integration

- [ ] **Google Calendar block-off sync** — XL  
  Read existing events and auto-create block-offs. Requires OAuth, an API route, and
  conflict resolution logic. Deferred per SPEC (v2+).

- [ ] **iCal export** — M  
  Export the week's sessions as an `.ics` file for one-way push to any calendar app.

---

## PWA / Offline

- [ ] **Lighthouse pass** — S  
  Run Lighthouse, address any PWA audit failures (manifest icons, service worker
  offline fallback). Currently the service worker is wired but untested offline.

- [ ] **Multi-device sync** — XL  
  Move storage from localStorage to Supabase/Vercel KV. Gating condition: second
  device or second user. Until then localStorage + export/import is sufficient.

---

## Open questions (from SPEC)

These need a decision before the relevant feature can be built.

- Do block-offs count *against* `hoursPerDay`, or are they additional capacity?
- Mobile target: read-only or full editing on small screens?
- Should completed sessions persist for a history view, or reset each week?
