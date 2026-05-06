import type { DayKey } from './types.js';

export interface WeekDay {
	key: DayKey;
	label: string;
	date: number;
	iso: string;      // "YYYY-MM-DD" in local time
	today: boolean;
	past: boolean;
	weekend: boolean;
}

const KEYS:   DayKey[] = ['mon','tue','wed','thu','fri','sat','sun'];
const LABELS: string[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/** Format a Date as a local "YYYY-MM-DD" string (avoids UTC offset issues). */
function localISO(d: Date): string {
	const y  = d.getFullYear();
	const m  = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${dd}`;
}

/**
 * Return the 7 days of the ISO week (Mon–Sun) containing today,
 * shifted by `offset` weeks (negative = past, positive = future).
 *
 * @param offset - Week offset from current week (0 = this week)
 */
export function getWeekDays(offset = 0): WeekDay[] {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	// distance to Monday: Sun(0) → -6, Mon(1) → 0, Tue(2) → -1, …
	const dow  = today.getDay();
	const toMon = dow === 0 ? -6 : 1 - dow;
	const monday = new Date(today);
	monday.setDate(today.getDate() + toMon + offset * 7);

	return KEYS.map((key, i) => {
		const d = new Date(monday);
		d.setDate(monday.getDate() + i);
		return {
			key,
			label:   LABELS[i],
			date:    d.getDate(),
			iso:     localISO(d),
			today:   d.getTime() === today.getTime(),
			past:    d < today,
			weekend: i >= 5,
		};
	});
}

/**
 * Human-readable label for a week, e.g. "May 5 – 11, 2026".
 * @param offset - Week offset from current week
 */
export function weekRangeLabel(offset = 0): string {
	const days = getWeekDays(offset);
	const mon  = new Date(days[0].iso + 'T12:00:00');
	const sun  = new Date(days[6].iso + 'T12:00:00');
	const fmt  = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	return `${fmt(mon)} – ${fmt(sun)}, ${sun.getFullYear()}`;
}
