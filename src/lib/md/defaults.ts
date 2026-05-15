/**
 * Parse Daily/Defaults.md and apply recurring task templates to day files.
 *
 * Format of Defaults.md:
 *   # Weekly          ← cadence (closed set)
 *   ## PP             ← category (maps to H1 in day files)
 *   - [ ] task line
 *
 *   # Monthly Start
 *   ## Dev
 *   - [ ] task line
 *
 *   # Monthly End
 *   ## Dev
 *   - [ ] task line
 *
 * Idempotency: a `<!-- defaults: <key> -->` marker written into the day file
 * prevents re-insertion across sessions. A session-level Set<string> prevents
 * inserting the same period into more than one file per session.
 */

export type Defaults = {
	weekly:       Record<string, string[]>;  // category → raw task lines
	monthlyStart: Record<string, string[]>;
	monthlyEnd:   Record<string, string[]>;
};

/**
 * Parse the contents of Daily/Defaults.md into cadence groups.
 * Unrecognised H1 cadences are silently ignored.
 *
 * @param content - Raw text of Defaults.md.
 */
export function parseDefaults(content: string): Defaults {
	const result: Defaults = { weekly: {}, monthlyStart: {}, monthlyEnd: {} };
	let cadence: keyof Defaults | null = null;
	let category: string | null = null;

	for (const line of content.split('\n')) {
		const h1 = line.match(/^#\s+(.+)/);
		if (h1) {
			const key = h1[1].trim();
			cadence = key === 'Weekly'        ? 'weekly'
			        : key === 'Monthly Start' ? 'monthlyStart'
			        : key === 'Monthly End'   ? 'monthlyEnd'
			        : null;
			category = null;
			continue;
		}

		if (!cadence) continue;

		const h2 = line.match(/^##\s+(.+)/);
		if (h2) {
			category = h2[1].trim();
			if (!result[cadence][category]) result[cadence][category] = [];
			continue;
		}

		if (category && /^\s*-\s*\[/.test(line)) {
			result[cadence][category].push(line);
		}
	}

	return result;
}

/**
 * ISO week string using Thursday-based ISO 8601 numbering, e.g. "2026-W19".
 *
 * @param date - UTC date to compute the week for.
 */
export function isoWeekKey(date: Date): string {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	// Shift to Thursday of this week to get the ISO year and week number.
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** True when date falls within the last 7 days of its calendar month. */
function isLastWeekOfMonth(date: Date): boolean {
	const lastDay = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
	).getUTCDate();
	return date.getUTCDate() > lastDay - 7;
}

/**
 * Return all period keys that apply to a given ISO date, paired with their
 * cadence key in the Defaults structure.
 *
 * - `weekly:YYYY-Www`       — every date
 * - `monthly-start:YYYY-MM` — day ≤ 7
 * - `monthly-end:YYYY-MM`   — last 7 days of month
 *
 * @param dateISO - ISO date string, e.g. "2026-05-12".
 */
export function periodKeysForDate(
	dateISO: string
): { key: string; cadence: keyof Defaults }[] {
	const d     = new Date(dateISO + 'T12:00:00Z');
	const yyyy  = d.getUTCFullYear();
	const mm    = String(d.getUTCMonth() + 1).padStart(2, '0');
	const month = `${yyyy}-${mm}`;

	const keys: { key: string; cadence: keyof Defaults }[] = [
		{ key: `weekly:${isoWeekKey(d)}`, cadence: 'weekly' },
	];
	if (d.getUTCDate() <= 7) {
		keys.push({ key: `monthly-start:${month}`, cadence: 'monthlyStart' });
	}
	if (isLastWeekOfMonth(d)) {
		keys.push({ key: `monthly-end:${month}`, cadence: 'monthlyEnd' });
	}
	return keys;
}

/**
 * Insert default task blocks into a day file for any cadences not yet marked.
 *
 * For each applicable period key:
 * - Skips if the key is already in `appliedPeriods` (another file this session).
 * - Skips if `<!-- defaults: <key> -->` already appears in the file.
 * - Otherwise inserts the tasks under their respective H1 categories, writing
 *   the marker before the first inserted block.
 *
 * Mutates `appliedPeriods` by adding processed keys.
 *
 * @param dayFile        - Raw day file text.
 * @param defaults       - Parsed Defaults.md.
 * @param dateISO        - ISO date of the day file, e.g. "2026-05-12".
 * @param appliedPeriods - Session-level set of already-processed period keys.
 * @returns Mutated text, or the original string if nothing changed.
 */
export function applyDefaults(
	dayFile:        string,
	defaults:       Defaults,
	dateISO:        string,
	appliedPeriods: Set<string>
): string {
	const periods = periodKeysForDate(dateISO);
	let content   = dayFile;

	for (const { key, cadence } of periods) {
		// Already handled this period in a different file this session.
		if (appliedPeriods.has(key)) continue;

		// Marker already written in a previous session.
		if (content.includes(`<!-- defaults: ${key} -->`)) {
			appliedPeriods.add(key);
			continue;
		}

		const entries = Object.entries(defaults[cadence]).filter(([, lines]) => lines.length > 0);
		if (!entries.length) {
			appliedPeriods.add(key);
			continue;
		}

		// Insert tasks under each category. Write the marker before the first block.
		let markerWritten = false;
		for (const [category, taskLines] of entries) {
			const marker = markerWritten ? null : `<!-- defaults: ${key} -->`;
			content = insertUnderCategory(content, category, taskLines, marker);
			markerWritten = true;
		}

		appliedPeriods.add(key);
	}

	return content;
}

/**
 * Insert `taskLines` at the end of the named H1 category section, optionally
 * preceded by a `marker` comment line. Creates the H1 at end-of-file if
 * the section doesn't exist.
 *
 * Insertion happens before any trailing blank lines in the section so that
 * the file's overall spacing is preserved.
 *
 * @param content   - Raw file text.
 * @param category  - H1 section name to insert under.
 * @param taskLines - Raw task lines to append.
 * @param marker    - Optional HTML comment line to write before the tasks.
 */
function insertUnderCategory(
	content:   string,
	category:  string,
	taskLines: string[],
	marker:    string | null
): string {
	const lines      = content.split('\n');
	const h1Pattern  = /^#\s+(.+)/;
	const insertLines = marker ? [marker, ...taskLines] : [...taskLines];

	// Locate the target H1 section.
	let sectionStart = -1;
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(h1Pattern);
		if (m && m[1].trim() === category) { sectionStart = i; break; }
	}

	if (sectionStart === -1) {
		// Section absent — append at end of file after a blank separator.
		const trimmed = content.trimEnd();
		return `${trimmed}\n\n# ${category}\n${insertLines.join('\n')}`;
	}

	// Find end of this section: next H1 or end of file.
	let insertAt = lines.length;
	for (let i = sectionStart + 1; i < lines.length; i++) {
		if (lines[i].match(h1Pattern)) { insertAt = i; break; }
	}

	// Walk back past trailing blank lines so we insert before them.
	let pos = insertAt;
	while (pos > sectionStart + 1 && lines[pos - 1].trim() === '') pos--;

	lines.splice(pos, 0, ...insertLines);
	return lines.join('\n');
}
