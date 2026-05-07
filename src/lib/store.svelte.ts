import { parseLine } from './parser.js';
import { schedule, placeTaskSessions, sessionFitsVisible } from './scheduler.js';
import { getWeekDays } from './dates.js';
import { snapshotState } from './persistence.js';
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
    { id: 'bo1', day: 'weekday', startSlot: 9, slots: 2, label: 'lunch' }
  ],
  dayStart: 9,
  dayEnd: 17.5,
  scheduleDirection: 'back'
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
  weekOffset: 0,   // 0 = current week, ±N = weeks from now
  drag: null as DragState | null,
  toast: null as { msg: string; error?: boolean } | null,
  weather: {} as Record<string, DayWeather>,
  selectedTaskId: null as string | null
});

// ── Action functions ───────────────────────────────────────────────────────────

/**
 * Re-run the scheduler against current tasks and config,
 * replacing app.sessions and app.unscheduled in place.
 *
 * WARNING: this is destructive — it discards all manual time-slot edits
 * and overflow placements. Use rescheduleTask() for single-task mutations.
 */
export function autoSchedule(): void {
  // Snapshot current state before wiping so the user can recover from
  // localStorage if Auto-schedule was clicked by mistake.
  snapshotState(app);

  // Only schedule into today and future days — past days are read-only.
  const eligible = getWeekDays(app.weekOffset)
    .filter(d => !d.past)
    .map(d => d.key);
  const result = schedule(app.tasks, app.config, uid, eligible);
  app.sessions = result.sessions;
  app.unscheduled = result.unscheduled;
}

/**
 * Re-place sessions for a single task without disturbing other tasks.
 * Removes the task's existing sessions and overflow entries, then runs
 * the scheduler against the remaining occupancy. Manual edits to other
 * tasks' sessions and other tasks' overflow are preserved.
 *
 * @param id - Task id to re-schedule
 */
export function rescheduleTask(id: string): void {
  // Drop this task's existing placements before computing new ones.
  const remainingSessions = app.sessions.filter(s => s.taskId !== id);
  const otherUnscheduled  = app.unscheduled.filter(u => u.taskId !== id);

  const eligible = getWeekDays(app.weekOffset)
    .filter(d => !d.past)
    .map(d => d.key);

  const result = placeTaskSessions(id, app.tasks, app.config, remainingSessions, uid, eligible);

  app.sessions = [...remainingSessions, ...result.sessions];
  app.unscheduled = [...otherUnscheduled, ...result.unscheduled];
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
    // Non-destructive: place only the new tasks. Existing sessions and
    // overflow are preserved verbatim. Within the new batch, sort by
    // priority (and total work) so higher-priority lines win the better
    // slots — matching scheduler.ts's global ordering rule.
    const newOnes = app.tasks.slice(app.tasks.length - added);
    const sortedNew = [...newOnes].sort((a, b) =>
      a.priority !== b.priority
        ? a.priority - b.priority
        : (b.sessionMin * b.sessionsTotal) - (a.sessionMin * a.sessionsTotal)
    );
    for (const t of sortedNew) rescheduleTask(t.id);
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

/**
 * Push pre-completed items (from a markdown [x] import) directly into done[].
 * Uses parseLine to extract duration; falls back to 30m default.
 *
 * @param lines - Bare task strings (already stripped of markdown syntax)
 */
export function addDoneItems(lines: string[]): void {
  const now = new Date().toISOString();
  for (const line of lines) {
    const p = parseLine(line);
    app.done.push({
      id: uid(),
      taskTitle: p?.title ?? line.trim(),
      sessionMin: p?.sessionMin ?? 30,
      doneAt: now
    });
  }
}

/** Remove a single entry from the done history. */
export function deleteDoneItem(id: string): void {
  app.done = app.done.filter(d => d.id !== id);
}

/** Clear all done history entries. */
export function clearDoneHistory(): void {
  app.done = [];
}

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
 * Duplicate a task. Clones structural fields, resets progress, and
 * re-schedules the new copy without disturbing other placements.
 *
 * @param id - Source task id
 * @returns New task id, or null if source not found
 */
export function duplicateTask(id: string): string | null {
  const src = app.tasks.find(t => t.id === id);
  if (!src) return null;
  const newId = uid();
  app.tasks.push({
    id: newId,
    title: src.title,
    sessionMin: src.sessionMin,
    sessionsTotal: src.sessionsTotal,
    sessionsDone: 0,
    priority: src.priority,
    createdAt: new Date().toISOString()
  });
  rescheduleTask(newId);
  showToast('Task duplicated');
  return newId;
}

/**
 * Create a new task and pin its single session at a specific day/slot.
 * Bypasses the scheduler so the placement is exactly where requested.
 * Used by the grid's double-click-to-add affordance.
 *
 * @param day - Target day key
 * @param slot - Target slot index (zero-based from DAY_START)
 * @param title - Initial title (defaults to "New task")
 * @returns New task id
 */
export function createTaskAtSlot(
  day: DayKey,
  slot: number,
  title = 'New task'
): string {
  const newId = uid();
  app.tasks.push({
    id: newId,
    title,
    sessionMin: 30,
    sessionsTotal: 1,
    sessionsDone: 0,
    priority: 3,
    createdAt: new Date().toISOString()
  });
  app.sessions.push({ id: uid(), taskId: newId, day, slot });
  return newId;
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
  if (structural) rescheduleTask(id);
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

/** Set priority on a group of tasks, then re-place each affected task individually. */
export function bulkSetPriority(ids: string[], priority: 1 | 2 | 3 | 4): void {
  for (const id of ids) {
    const t = app.tasks.find(x => x.id === id);
    if (t) t.priority = priority;
  }
  for (const id of ids) rescheduleTask(id);
}

/** Set duration (minutes) on a group of tasks, then re-place each affected task individually. */
export function bulkSetDuration(ids: string[], sessionMin: number): void {
  for (const id of ids) {
    const t = app.tasks.find(x => x.id === id);
    if (t) t.sessionMin = sessionMin;
  }
  for (const id of ids) rescheduleTask(id);
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
 * Replace the app config without destroying placements.
 *
 * Sessions that still fit under the new config (within the visible day
 * window and not overlapping any blockoff) stay exactly where they are.
 * Sessions that would fall outside the grid or land on a new blockoff
 * are moved to overflow so the user can re-place them deliberately.
 *
 * @param cfg - New config object
 */
export function applyConfig(cfg: Config): void {
  app.config = cfg;

  const kept: Session[] = [];
  const evicted: UnscheduledSession[] = [];
  for (const s of app.sessions) {
    const t = app.tasks.find(x => x.id === s.taskId);
    if (t && sessionFitsVisible(s, t, cfg)) {
      kept.push(s);
    } else {
      evicted.push({ id: s.id, taskId: s.taskId });
    }
  }

  app.sessions = kept;
  if (evicted.length > 0) {
    app.unscheduled = [...app.unscheduled, ...evicted];
    showToast(
      `${evicted.length} session${evicted.length > 1 ? 's' : ''} moved to overflow (no longer fit)`
    );
  }
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
