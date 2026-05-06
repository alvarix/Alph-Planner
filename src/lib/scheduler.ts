import type { Task, Session, UnscheduledSession, Config, DayKey } from './types.js';

const ALL_DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WKND: DayKey[] = ['sat', 'sun'];

/**
 * Number of 30-min slots needed to cover `min` minutes.
 * @param min - Duration in minutes
 */
const slotsFor = (min: number): number => Math.ceil(min / 30);

/**
 * Return blockoffs that apply to a specific day key,
 * expanding 'weekday'/'weekend' recurrence patterns.
 *
 * @param config - App configuration
 * @param key - Day to check
 */
function dayBlockoffs(config: Config, key: DayKey) {
  return config.blockoffs.filter(b =>
    b.day === key ||
    (b.day === 'weekday' && !WKND.includes(key)) ||
    (b.day === 'weekend' && WKND.includes(key))
  );
}

/**
 * Check whether `n` consecutive slots starting at `start` are free in `dayKey`.
 *
 * For 'front' direction: sessions fill from dayStart, capped at hoursPerDay.
 * For 'back' direction: sessions fill from dayEnd backwards, capped at hoursPerDay.
 *
 * @param config - App configuration
 * @param dayKey - Day being tested
 * @param start - Starting slot index
 * @param n - Number of contiguous slots required
 * @param occ - Set of already-occupied slot indices for this day
 * @param nslots - Total slots in the day window
 * @param direction - 'front' fills from start, 'back' fills from end
 */
function isFree(
  config: Config,
  dayKey: DayKey,
  start: number,
  n: number,
  occ: Set<number>,
  nslots: number,
  direction: 'front' | 'back'
): boolean {
  const cap = config.hoursPerDay[dayKey];

  if (direction === 'back') {
    // Sessions must end at or before dayEnd and start within the hoursPerDay window
    if (start + n > nslots) return false;
    if (start < nslots - cap * 2) return false;
  } else {
    // Sessions must start within the hoursPerDay window from dayStart
    if (start + n > cap * 2) return false;
  }

  const bos = dayBlockoffs(config, dayKey);
  for (let i = 0; i < n; i++) {
    const s = start + i;
    if (occ.has(s)) return false;
    for (const bo of bos) {
      if (s >= bo.startSlot && s < bo.startSlot + bo.slots) return false;
    }
  }
  return true;
}

/**
 * Init a fresh occupancy map and pre-fill blockoff slots.
 *
 * @param config - App configuration
 */
function initOcc(config: Config): Record<DayKey, Set<number>> {
  const occ: Record<DayKey, Set<number>> = {} as Record<DayKey, Set<number>>;
  ALL_DAYS.forEach(d => { occ[d] = new Set<number>(); });
  config.blockoffs.forEach(bo => {
    const days: DayKey[] =
      bo.day === 'weekday' ? ['mon', 'tue', 'wed', 'thu', 'fri'] :
      bo.day === 'weekend' ? ['sat', 'sun'] :
      [bo.day as DayKey];
    days.forEach(dk => {
      for (let i = 0; i < bo.slots; i++) occ[dk].add(bo.startSlot + i);
    });
  });
  return occ;
}

/**
 * Place all needed sessions for a single task into `occ`, appending to
 * `outSessions` and `outUnscheduled`. Mutates `occ` to reflect placements.
 *
 * @param task - Task to place
 * @param config - App configuration
 * @param occ - Occupancy map (mutated)
 * @param workdays - Days eligible for placement
 * @param nslots - Total slots in the day window
 * @param direction - 'front' or 'back'
 * @param uidFn - Unique-id generator
 * @param outSessions - Array sessions are appended to
 * @param outUnscheduled - Array overflows are appended to
 */
function placeOneTask(
  task: Task,
  config: Config,
  occ: Record<DayKey, Set<number>>,
  workdays: DayKey[],
  nslots: number,
  direction: 'front' | 'back',
  uidFn: () => string,
  outSessions: Session[],
  outUnscheduled: UnscheduledSession[]
): void {
  const n = slotsFor(task.sessionMin);
  const remaining = task.sessionsTotal - task.sessionsDone;
  const usedDays = new Set<DayKey>();

  for (let s = 0; s < remaining; s++) {
    const order = [...workdays].sort((a, b) => {
      const da = usedDays.has(a) ? 1 : 0;
      const db = usedDays.has(b) ? 1 : 0;
      if (da !== db) return da - db;
      const wa = WKND.includes(a) ? 1 : 0;
      const wb = WKND.includes(b) ? 1 : 0;
      if (wa !== wb) return wa - wb;
      const remA = config.hoursPerDay[a] * 2 - occ[a].size;
      const remB = config.hoursPerDay[b] * 2 - occ[b].size;
      return remB - remA;
    });

    let placed = false;

    for (const day of order) {
      if (direction === 'back') {
        for (let slot = nslots - n; slot >= 0; slot--) {
          if (isFree(config, day, slot, n, occ[day], nslots, 'back')) {
            const id = uidFn();
            outSessions.push({ id, taskId: task.id, day, slot });
            for (let i = 0; i < n; i++) occ[day].add(slot + i);
            usedDays.add(day);
            placed = true;
            break;
          }
        }
      } else {
        for (let slot = 0; slot + n <= nslots; slot++) {
          if (isFree(config, day, slot, n, occ[day], nslots, 'front')) {
            const id = uidFn();
            outSessions.push({ id, taskId: task.id, day, slot });
            for (let i = 0; i < n; i++) occ[day].add(slot + i);
            usedDays.add(day);
            placed = true;
            break;
          }
        }
      }
      if (placed) break;
    }

    if (!placed) {
      outUnscheduled.push({ id: uidFn(), taskId: task.id });
    }
  }
}

/**
 * Greedily schedule all sessions by priority, then by total work descending.
 * Sessions for the same task are spread across different days where possible.
 * Sessions that can't be placed go to the unscheduled overflow.
 *
 * Direction is controlled by config.scheduleDirection:
 *   'back'  — fills from dayEnd backwards (default)
 *   'front' — fills from dayStart forwards
 *
 * This is a pure function — it does not mutate any of its inputs.
 *
 * @param tasks - All tasks to schedule
 * @param config - Hour caps, block-offs, weekend flag, day window
 * @param uidFn - Callback to generate unique IDs for new sessions
 * @param eligibleDays - When provided, restricts which days are eligible (e.g. today + future days only)
 * @returns Object with placed sessions and unscheduled overflows
 */
export function schedule(
  tasks: Task[],
  config: Config,
  uidFn: () => string,
  eligibleDays?: DayKey[]
): { sessions: Session[]; unscheduled: UnscheduledSession[] } {
  const sessions: Session[] = [];
  const unscheduled: UnscheduledSession[] = [];

  const dayStart = config.dayStart ?? 9;
  const dayEnd = config.dayEnd ?? 17.5;
  const direction = config.scheduleDirection ?? 'back';
  const nslots = Math.round((dayEnd - dayStart) * 2);

  const occ = initOcc(config);

  const pool = eligibleDays ?? ALL_DAYS;
  const workdays = pool.filter(d => config.hoursPerDay[d] > 0);

  // Sort: priority asc (p1 first), then total work desc
  const sorted = [...tasks].sort((a, b) =>
    a.priority !== b.priority
      ? a.priority - b.priority
      : (b.sessionMin * b.sessionsTotal) - (a.sessionMin * a.sessionsTotal)
  );

  for (const task of sorted) {
    placeOneTask(task, config, occ, workdays, nslots, direction, uidFn, sessions, unscheduled);
  }

  return { sessions, unscheduled };
}

/**
 * Re-place sessions for a single task while preserving all other tasks'
 * existing placements and overflow. Used when a single task's structural
 * data (duration, sessionsTotal, priority) changes — avoids the destructive
 * full re-schedule that would discard manual time-slot edits.
 *
 * Treats `existingSessions` (excluding any for `taskId`) as occupied.
 * Looks up each existing session's task in `allTasks` to compute its slot width.
 *
 * @param taskId - Task whose sessions should be re-placed
 * @param allTasks - Full task list (used to derive slot widths of other sessions)
 * @param config - App configuration
 * @param existingSessions - Currently placed sessions (manual edits preserved)
 * @param uidFn - Unique-id generator
 * @param eligibleDays - When provided, restricts which days are eligible
 * @returns New sessions and overflow entries for the changed task only
 */
export function placeTaskSessions(
  taskId: string,
  allTasks: Task[],
  config: Config,
  existingSessions: Session[],
  uidFn: () => string,
  eligibleDays?: DayKey[]
): { sessions: Session[]; unscheduled: UnscheduledSession[] } {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return { sessions: [], unscheduled: [] };

  const sessions: Session[] = [];
  const unscheduled: UnscheduledSession[] = [];

  const dayStart = config.dayStart ?? 9;
  const dayEnd = config.dayEnd ?? 17.5;
  const direction = config.scheduleDirection ?? 'back';
  const nslots = Math.round((dayEnd - dayStart) * 2);

  const occ = initOcc(config);

  // Mark slots occupied by every other task's existing sessions.
  for (const s of existingSessions) {
    if (s.taskId === taskId) continue;
    const t = allTasks.find(x => x.id === s.taskId);
    if (!t) continue;
    const w = slotsFor(t.sessionMin);
    for (let i = 0; i < w; i++) occ[s.day].add(s.slot + i);
  }

  const pool = eligibleDays ?? ALL_DAYS;
  const workdays = pool.filter(d => config.hoursPerDay[d] > 0);

  placeOneTask(task, config, occ, workdays, nslots, direction, uidFn, sessions, unscheduled);

  return { sessions, unscheduled };
}
