import type { Task, Session, UnscheduledSession, Config, DayKey } from './types.js';

const DAY_START = 9;
const DAY_END = 18;
const NSLOTS = (DAY_END - DAY_START) * 2; // 18 slots

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
 * Slots are occupied by:
 *  - Previously placed sessions (tracked in `occ`)
 *  - Block-offs defined in config
 *  - Slots beyond the day's hour cap
 *
 * @param config - App configuration
 * @param dayKey - Day being tested
 * @param start - Starting slot index
 * @param n - Number of contiguous slots required
 * @param occ - Set of already-occupied slot indices for this day
 */
function isFree(
  config: Config,
  dayKey: DayKey,
  start: number,
  n: number,
  occ: Set<number>
): boolean {
  const cap = config.hoursPerDay[dayKey];
  // cap is in hours; convert to slots for the boundary check
  if (start + n > cap * 2) return false;

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
 * Greedily schedule all sessions by priority, then by total work descending.
 * Sessions for the same task are spread across different days where possible.
 * Sessions that can't be placed go to the unscheduled overflow.
 *
 * This is a pure function — it does not mutate any of its inputs.
 *
 * @param tasks - All tasks to schedule
 * @param config - Hour caps, block-offs, weekend flag
 * @param uidFn - Callback to generate unique IDs for new sessions
 * @returns Object with placed sessions and unscheduled overflows
 */
export function schedule(
  tasks: Task[],
  config: Config,
  uidFn: () => string
): { sessions: Session[]; unscheduled: UnscheduledSession[] } {
  const sessions: Session[] = [];
  const unscheduled: UnscheduledSession[] = [];

  // Track occupied slots per day
  const occ: Record<DayKey, Set<number>> = {} as Record<DayKey, Set<number>>;
  ALL_DAYS.forEach(d => { occ[d] = new Set<number>(); });

  // Pre-fill blockoff slots so isFree doesn't double-check (belt and suspenders)
  config.blockoffs.forEach(bo => {
    const days: DayKey[] =
      bo.day === 'weekday' ? ['mon', 'tue', 'wed', 'thu', 'fri'] :
      bo.day === 'weekend' ? ['sat', 'sun'] :
      [bo.day as DayKey];
    days.forEach(dk => {
      for (let i = 0; i < bo.slots; i++) occ[dk].add(bo.startSlot + i);
    });
  });

  // Eligible working days (positive hour cap)
  const workdays = ALL_DAYS.filter(d => config.hoursPerDay[d] > 0);

  // Sort: priority asc (p1 first), then total work desc
  const sorted = [...tasks].sort((a, b) =>
    a.priority !== b.priority
      ? a.priority - b.priority
      : (b.sessionMin * b.sessionsTotal) - (a.sessionMin * a.sessionsTotal)
  );

  for (const task of sorted) {
    const n = slotsFor(task.sessionMin);
    const remaining = task.sessionsTotal - task.sessionsDone;
    const usedDays = new Set<DayKey>();

    for (let s = 0; s < remaining; s++) {
      // Prefer days this task hasn't used yet (spread across the week)
      const order = [...workdays].sort((a, b) =>
        (usedDays.has(a) ? 1 : 0) - (usedDays.has(b) ? 1 : 0)
      );

      let placed = false;

      for (const day of order) {
        for (let slot = 0; slot + n <= NSLOTS; slot++) {
          if (isFree(config, day, slot, n, occ[day])) {
            const id = uidFn();
            sessions.push({ id, taskId: task.id, day, slot });
            for (let i = 0; i < n; i++) occ[day].add(slot + i);
            usedDays.add(day);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }

      if (!placed) {
        unscheduled.push({ id: uidFn(), taskId: task.id });
      }
    }
  }

  return { sessions, unscheduled };
}
