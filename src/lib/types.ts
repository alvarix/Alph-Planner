export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type RecurKey = DayKey | 'weekday' | 'weekend';

export interface Task {
  id: string;
  title: string;
  /** Duration of one session in minutes */
  sessionMin: number;
  sessionsTotal: number;
  sessionsDone: number;
  priority: 1 | 2 | 3 | 4;
  createdAt: string;
}

export interface Session {
  id: string;
  taskId: string;
  day: DayKey;
  /** Zero-based slot index from DAY_START (0 = 9:00, 1 = 9:30, etc.) */
  slot: number;
}

export interface UnscheduledSession {
  id: string;
  taskId: string;
}

export interface Blockoff {
  id: string;
  /** DayKey for a single day, or 'weekday'/'weekend' for recurring */
  day: RecurKey;
  startSlot: number;
  slots: number;
  label: string;
}

export interface Config {
  hoursPerDay: Record<DayKey, number>;
  weekendsEnabled: boolean;
  blockoffs: Blockoff[];
}

export interface DragState {
  type: 'sess' | 'unsched';
  id: string;
  slots: number;
}

export interface DoneSession {
  id: string;
  taskId: string;
  taskTitle: string;
  sessionMin: number;
  doneAt: string; // ISO timestamp
}
