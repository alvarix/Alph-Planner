import { parseLine } from './parser.js';
import { schedule } from './scheduler.js';
import type { Task, Session, UnscheduledSession, Config, DragState, DayKey } from './types.js';
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
  config: structuredClone(defaultConfig) as Config,
  drag: null as DragState | null,
  toast: null as { msg: string; error?: boolean } | null,
  weather: {} as Record<string, DayWeather>
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
    const parsed = parseLine(line);
    if (parsed) {
      const task: Task = {
        ...parsed,
        id: uid(),
        createdAt: new Date().toISOString()
      };
      app.tasks.push(task);
      added++;
    }
  }
  if (added > 0) {
    autoSchedule();
    const skipped = lines.length - added;
    const msg = skipped > 0
      ? `Added ${added} task${added > 1 ? 's' : ''} (${skipped} skipped — no duration)`
      : `Added ${added} task${added > 1 ? 's' : ''}`;
    showToast(msg);
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
  if (t) t.sessionsDone = Math.min(t.sessionsTotal, t.sessionsDone + 1);
  const idx = app.sessions.findIndex(x => x.id === sessId);
  if (idx !== -1) app.sessions.splice(idx, 1);
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
