import { parseLine } from './parser.js';
import { schedule } from './scheduler.js';
import type { Task, Session, UnscheduledSession, DoneSession, Config, DragState, DayKey } from './types.js';
import type { DayWeather } from './weather.js';

// ── UID counter ────────────────────────────────────────────────────────────────

let _uid = 1;

/**
 * Generate a unique string ID.
 * @returns Unique id string like "x1", "x2", …
 */
export function uid(): string {
  return `x${_uid++}`;
}

/**
 * Advance the uid counter past any ids already in the persisted state
 * to avoid collisions after a reload.
 * @param ids - Array of existing id strings
 */
export function syncUidCounter(ids: string[]): void {
  for (const id of ids) {
    const n = parseInt(id.replace(/\D/g, ''), 10);
    if (!isNaN(n) && n >= _uid) _uid = n + 1;
  }
}

// ── Default config ─────────────────────────────────────────────────────────────

const defaultConfig: Config = {
  hoursPerDay: { mon: 6, tue: 6, wed: 6, thu: 6, fri: 4, sat: 0, sun: 0 },
  weekendsEnabled: false,
  blockoffs: [
    { id: 'bo1', day: 'weekday', startSlot: 6, slots: 2, label: 'lunch' }
  ]
};

// ── Reactive app state (Svelte 5 runes) ───────────────────────────────────────

/**
 * Central application state object.
 * All components read from and mutate this directly.
 * Svelte's $state() makes it deeply reactive.
 */
export const app = $state({
  tasks: [] as Task[],
  sessions: [] as Session[],
  unscheduled: [] as UnscheduledSession[],
  done: [] as DoneSession[],
  config: structuredClone(defaultConfig) as Config,
  drag: null as DragState | null,
  toast: null as { msg: string; error?: boolean } | null,
  weather: {} as Record<string, DayWeather>,
  selectedTaskId: null as string | null
});

// ── Action functions ───────────────────────────────────────────────────────────

/**
 * Re-run the scheduler against current tasks and config,
 * replacing app.sessions and app.unscheduled in place.
 */
export function autoSchedule(): void {
  const result = schedule(app.tasks, app.config, uid);
  app.sessions = result.sessions;
  app.unscheduled = result.unscheduled;
}

/**
 * Parse an array of raw input lines, add valid tasks, then re-schedule.
 * Lines that fail to parse are silently skipped.
 *
 * @param lines - Raw text lines from the task input textarea
 * @returns Number of tasks successfully added
 */
export function addTasks(lines: string[]): number {
  let added = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // parseLine now returns null only for truly blank lines (already filtered above).
    // Missing duration → apply defaults: 30 m, p3, x1.
    const parsed = parseLine(trimmed) ?? {
      title: trimmed,
      sessionMin: 30,
      sessionsTotal: 1,
      sessionsDone: 0,
      priority: 3 as const
    };
    app.tasks.push({ ...parsed, id: uid(), createdAt: new Date().toISOString() });
    added++;
  }
  if (added > 0) {
    autoSchedule();
    showToast(`Added ${added} task${added > 1 ? 's' : ''}`);
  }
  return added;
}

/**
 * Move an existing scheduled session to a new day/slot.
 * No re-schedule — the user has manually placed it.
 *
 * @param id - Session id
 * @param day - Target day key
 * @param slot - Target slot index
 */
export function moveSession(id: string, day: DayKey, slot: number): void {
  const s = app.sessions.find(x => x.id === id);
  if (s) {
    s.day = day;
    s.slot = slot;
  }
}

/**
 * Promote an unscheduled session to a placed session.
 *
 * @param id - UnscheduledSession id
 * @param day - Target day key
 * @param slot - Target slot index
 */
export function scheduleUnscheduled(id: string, day: DayKey, slot: number): void {
  const idx = app.unscheduled.findIndex(x => x.id === id);
  if (idx === -1) return;
  const [u] = app.unscheduled.splice(idx, 1);
  app.sessions.push({ id: u.id, taskId: u.taskId, day, slot });
}

/**
 * Mark a session as complete.
 * Increments task.sessionsDone and removes the session from the grid.
 *
 * @param sessId - Session id to mark done
 */
export function markDone(sessId: string): void {
  const s = app.sessions.find(x => x.id === sessId);
  if (!s) return;
  const t = app.tasks.find(x => x.id === s.taskId);
  if (t) {
    t.sessionsDone = Math.min(t.sessionsTotal, t.sessionsDone + 1);
    app.done.push({
      id: s.id,
      taskId: s.taskId,
      taskTitle: t.title,
      sessionMin: t.sessionMin,
      doneAt: new Date().toISOString()
    });
  }
  app.sessions = app.sessions.filter(x => x.id !== sessId);
}

/** Remove a session from the grid without counting it as done. */
export function deleteSess(sessId: string): void {
  app.sessions = app.sessions.filter(x => x.id !== sessId);
}

/** Highlight a task in the sidebar and open its inline editor. */
export function selectTask(id: string): void { app.selectedTaskId = id; }

/** Clear the sidebar highlight/edit selection. */
export function clearSelection(): void { app.selectedTaskId = null; }

/** Move a placed session back to the Overflow rail (drag off grid). */
export function unscheduleSession(sessId: string): void {
  const s = app.sessions.find(x => x.id === sessId);
  if (!s) return;
  app.sessions = app.sessions.filter(x => x.id !== sessId);
  app.unscheduled.push({ id: s.id, taskId: s.taskId });
}

/**
 * Update a task's fields; re-schedules if structural data changed.
 * Title-only changes skip the full re-schedule.
 */
export function updateTask(
  id: string,
  title: string,
  sessionMin: number,
  sessionsTotal: number,
  priority: 1 | 2 | 3 | 4
): void {
  const t = app.tasks.find(x => x.id === id);
  if (!t) return;
  const structural =
    t.sessionMin !== sessionMin ||
    t.sessionsTotal !== sessionsTotal ||
    t.priority !== priority;
  t.title = title;
  t.sessionMin = sessionMin;
  t.sessionsTotal = sessionsTotal;
  t.priority = priority;
  if (structural) autoSchedule();
}

/** Remove all tasks, sessions, overflow, and done history. */
export function clearAllTasks(): void {
  app.tasks = [];
  app.sessions = [];
  app.unscheduled = [];
  app.done = [];
}

/** Delete a set of tasks and all their sessions. */
export function deleteSelectedTasks(ids: string[]): void {
  const set = new Set(ids);
  app.tasks       = app.tasks.filter(t => !set.has(t.id));
  app.sessions    = app.sessions.filter(s => !set.has(s.taskId));
  app.unscheduled = app.unscheduled.filter(u => !set.has(u.taskId));
}

/** Set priority on a group of tasks, then re-schedule. */
export function bulkSetPriority(ids: string[], priority: 1 | 2 | 3 | 4): void {
  for (const id of ids) {
    const t = app.tasks.find(x => x.id === id);
    if (t) t.priority = priority;
  }
  autoSchedule();
}

/** Set duration (minutes) on a group of tasks, then re-schedule. */
export function bulkSetDuration(ids: string[], sessionMin: number): void {
  for (const id of ids) {
    const t = app.tasks.find(x => x.id === id);
    if (t) t.sessionMin = sessionMin;
  }
  autoSchedule();
}

/**
 * Remove a task and all its scheduled/unscheduled sessions.
 *
 * @param id - Task id to remove
 */
export function removeTask(id: string): void {
  const ti = app.tasks.findIndex(t => t.id === id);
  if (ti !== -1) app.tasks.splice(ti, 1);
  // Remove all associated sessions
  for (let i = app.sessions.length - 1; i >= 0; i--) {
    if (app.sessions[i].taskId === id) app.sessions.splice(i, 1);
  }
  for (let i = app.unscheduled.length - 1; i >= 0; i--) {
    if (app.unscheduled[i].taskId === id) app.unscheduled.splice(i, 1);
  }
}

/**
 * Replace the app config and re-schedule everything.
 *
 * @param cfg - New config object
 */
export function applyConfig(cfg: Config): void {
  app.config = cfg;
  autoSchedule();
}

/**
 * Clear all unscheduled sessions (roll them to "next week").
 * Shows a toast confirming the action.
 */
export function rollToNextWeek(): void {
  const n = app.unscheduled.length;
  if (!n) {
    showToast('Nothing to roll');
    return;
  }
  app.unscheduled = [];
  showToast(`Rolled ${n} session${n > 1 ? 's' : ''} to next week`);
}

// Toast timer handle — kept module-level to allow clearing on rapid calls
let _toastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Show a status toast message, auto-dismissing after 2400ms.
 *
 * @param msg - Message to display
 * @param error - If true, shows in error (red) style
 */
export function showToast(msg: string, error = false): void {
  if (_toastTimer) clearTimeout(_toastTimer);
  app.toast = { msg, error };
  _toastTimer = setTimeout(() => {
    app.toast = null;
    _toastTimer = null;
  }, 2400);
}

/**
 * Set the active drag state.
 * @param state - DragState describing what's being dragged
 */
export function setDrag(state: DragState): void {
  app.drag = state;
}

/**
 * Clear the drag state (call on dragend).
 */
export function clearDrag(): void {
  app.drag = null;
}
