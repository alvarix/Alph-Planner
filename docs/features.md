# Features

Plain-English reference. Updated whenever a feature is added or changed.

---

## Task input

Type one task per line in the Inbox using the terse syntax:

```
ship invoice 1h, p1
draft email .5h x2, p2
deep work 2h x3, p3
```

Parts:
- **title** — free text up to the first time token
- **duration** — `1h`, `.5h`, `90m` (required)
- **x2** — number of sessions (optional, default 1)
- **p1**–**p4** — priority, 1 = highest (optional, default 3)

Press **Add** or `Cmd+Enter` to submit. Press `n` from anywhere to jump to the input.

---

## Auto-scheduler

Click **Auto-schedule** after adding tasks. The scheduler:

1. Sorts tasks by priority (p1 first), then by total work descending
2. Places each session into the earliest open slot on a day not yet used by the same task
3. Respects per-day hour caps and block-offs (e.g. lunch)
4. Anything that doesn't fit goes to the **Overflow** rail

Drag any session block to a new slot to override the auto-placement.
Drag from Overflow into the grid to schedule a session manually.

---

## Week grid

The center panel shows Mon–Sun in columns with 30-minute rows from 9 am to 6 pm.
Session blocks are colour-coded by priority (red → orange → blue → grey).

- **✓** on a block marks it done and increments the task's progress counter
- Weekend columns are collapsed (0h cap) by default; enable them in Config

---

## Overflow

Sessions that couldn't fit in the week appear in the Overflow rail on the right.
**Roll to next week** clears the list (in v1 this is cosmetic; v2 will carry them forward to the next week's file).

The capacity bar at the bottom shows what percentage of your weekly hours are filled.

---

## Config

Click **⚙** in the top bar.

- **Hours per day** — set how many working hours each day can hold
- **Weekends** — toggle on to schedule into Saturday/Sunday; their hour caps appear when enabled
- **Block-offs** — recurring (every weekday) or specific-day time blocks the scheduler will avoid. Add a label, pick the day and start/end time, click **+ Add block-off**. Deleting a block-off and clicking **Apply & re-schedule** updates the grid immediately.
- **Export JSON** — download your current tasks, sessions, and config as a JSON file
- **Import JSON** — load a previously exported file
- **Reset everything** — clears all data and localStorage (requires confirmation)

---

## Week weather

The day headers show a weather emoji and forecast high temperature for each day,
pulled live from [Open-Meteo](https://open-meteo.com/) (free, no API key).

The app requests your browser location when the page loads. If you deny the
permission or the fetch fails, the weather strip simply stays blank — nothing
else is affected. Hover a weather icon to see the full description and low temp.

---

## Mobile layout

On screens narrower than 640 px, the three panels collapse to a bottom tab bar:
**Week** (grid), **Tasks** (inbox), **Overflow** (unscheduled). A red dot on
the Overflow tab appears when sessions are waiting to be scheduled.

---

## Persistence

State (tasks, sessions, config) is saved to `localStorage` automatically after
every change. It survives page refreshes. Use Export/Import in Config to back up
or move data between devices.
