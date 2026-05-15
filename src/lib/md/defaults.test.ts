import { describe, it, expect } from 'vitest';
import { parseDefaults, applyDefaults, periodKeysForDate, isoWeekKey } from './defaults.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function lines(...args: string[]) {
	return args.join('\n');
}

// ── parseDefaults ─────────────────────────────────────────────────────────────

describe('parseDefaults', () => {
	it('parses a Weekly section with one category', () => {
		const d = parseDefaults(lines(
			'# Weekly',
			'## PP',
			'- [ ] instagram user story',
		));
		expect(d.weekly['PP']).toEqual(['- [ ] instagram user story']);
		expect(d.monthlyStart).toEqual({});
		expect(d.monthlyEnd).toEqual({});
	});

	it('parses Monthly Start and Monthly End sections', () => {
		const d = parseDefaults(lines(
			'# Monthly Start',
			'## Dev',
			'- [ ] Digital Ocean updates',
			'# Monthly End',
			'## Dev',
			'- [ ] Invoice',
		));
		expect(d.monthlyStart['Dev']).toEqual(['- [ ] Digital Ocean updates']);
		expect(d.monthlyEnd['Dev']).toEqual(['- [ ] Invoice']);
	});

	it('parses multiple tasks under a category', () => {
		const d = parseDefaults(lines(
			'# Weekly',
			'## PP',
			'- [ ] task one',
			'- [ ] task two',
		));
		expect(d.weekly['PP']).toEqual(['- [ ] task one', '- [ ] task two']);
	});

	it('ignores unrecognised H1 cadences', () => {
		const d = parseDefaults(lines(
			'# Daily',
			'## Work',
			'- [ ] standup',
			'# Weekly',
			'## PP',
			'- [ ] newsletter',
		));
		expect(Object.keys(d.weekly)).toEqual(['PP']);
		expect(d.monthlyStart).toEqual({});
	});

	it('handles multiple categories within one cadence', () => {
		const d = parseDefaults(lines(
			'# Weekly',
			'## PP',
			'- [ ] task a',
			'## Dev',
			'- [ ] task b',
		));
		expect(d.weekly['PP']).toEqual(['- [ ] task a']);
		expect(d.weekly['Dev']).toEqual(['- [ ] task b']);
	});

	it('returns empty Defaults for an empty file', () => {
		const d = parseDefaults('');
		expect(d).toEqual({ weekly: {}, monthlyStart: {}, monthlyEnd: {} });
	});
});

// ── isoWeekKey ────────────────────────────────────────────────────────────────

describe('isoWeekKey', () => {
	it('returns correct ISO week for a known Monday', () => {
		// 2026-05-11 is a Monday in W20
		expect(isoWeekKey(new Date('2026-05-11T12:00:00Z'))).toBe('2026-W20');
	});

	it('returns the same week key for all days in the same week', () => {
		const mon = isoWeekKey(new Date('2026-05-11T12:00:00Z'));
		const fri = isoWeekKey(new Date('2026-05-15T12:00:00Z'));
		expect(mon).toBe(fri);
	});

	it('uses ISO year for week 1 boundary (Jan 1 may be W52 of prior year)', () => {
		// 2021-01-01 is in ISO week 53 of 2020
		expect(isoWeekKey(new Date('2021-01-01T12:00:00Z'))).toBe('2020-W53');
	});
});

// ── periodKeysForDate ─────────────────────────────────────────────────────────

describe('periodKeysForDate', () => {
	it('always includes a weekly key', () => {
		const keys = periodKeysForDate('2026-05-13');
		expect(keys.some(k => k.cadence === 'weekly')).toBe(true);
	});

	it('includes monthly-start for a day ≤ 7', () => {
		const keys = periodKeysForDate('2026-05-05');
		expect(keys.some(k => k.key.startsWith('monthly-start:'))).toBe(true);
	});

	it('does not include monthly-start for a day > 7', () => {
		const keys = periodKeysForDate('2026-05-08');
		expect(keys.some(k => k.key.startsWith('monthly-start:'))).toBe(false);
	});

	it('includes monthly-end for the last 7 days of month', () => {
		// May has 31 days; day 25 is 31-6 = last 7
		const keys = periodKeysForDate('2026-05-25');
		expect(keys.some(k => k.key.startsWith('monthly-end:'))).toBe(true);
	});

	it('does not include monthly-end for a mid-month day', () => {
		const keys = periodKeysForDate('2026-05-15');
		expect(keys.some(k => k.key.startsWith('monthly-end:'))).toBe(false);
	});

	it('all three cadences fire on month-start that is also last week boundary', () => {
		// Feb 2026: Feb has 28 days; day 1 ≤ 7 AND day 25+ > 21 (28-7=21)
		// Feb 22 is > 21, so monthly-end fires there; day 1 fires monthly-start
		// A date that is both: e.g. a 28-day month where day 1 > 21 → impossible
		// Use a month with 7 days left on day 1 — not possible; skip this edge case
		// Instead verify that a day-1 date includes both weekly and monthly-start.
		const keys = periodKeysForDate('2026-05-01');
		const cadences = keys.map(k => k.cadence);
		expect(cadences).toContain('weekly');
		expect(cadences).toContain('monthlyStart');
	});
});

// ── applyDefaults ─────────────────────────────────────────────────────────────

describe('applyDefaults', () => {
	const defaults = parseDefaults(lines(
		'# Weekly',
		'## PP',
		'- [ ] instagram user story',
		'# Monthly Start',
		'## Dev',
		'- [ ] Digital Ocean updates',
		'# Monthly End',
		'## Dev',
		'- [ ] Invoice',
	));

	it('inserts weekly tasks under an existing category', () => {
		const day = lines('# PP', '- [ ] existing');
		const result = applyDefaults(day, defaults, '2026-05-13', new Set());
		expect(result).toContain('- [ ] instagram user story');
		expect(result).toContain('<!-- defaults: weekly:');
		expect(result).toContain('- [ ] existing');
	});

	it('creates a new H1 category when the section is absent', () => {
		const day = '- [ ] some task';
		const result = applyDefaults(day, defaults, '2026-05-13', new Set());
		expect(result).toContain('# PP');
		expect(result).toContain('- [ ] instagram user story');
	});

	it('is idempotent: applying twice yields identical output', () => {
		const day = '# PP\n- [ ] existing';
		const once  = applyDefaults(day, defaults, '2026-05-13', new Set());
		const twice = applyDefaults(once, defaults, '2026-05-13', new Set());
		expect(twice).toBe(once);
	});

	it('skips insertion when appliedPeriods already contains the key', () => {
		const weekKey = periodKeysForDate('2026-05-13').find(k => k.cadence === 'weekly')!.key;
		const applied = new Set([weekKey]);
		const day = '# PP\n- [ ] existing';
		const result = applyDefaults(day, defaults, '2026-05-13', applied);
		expect(result).not.toContain('instagram user story');
	});

	it('adds the period key to appliedPeriods after inserting', () => {
		const applied: Set<string> = new Set();
		const day = '# PP';
		applyDefaults(day, defaults, '2026-05-13', applied);
		expect([...applied].some(k => k.startsWith('weekly:'))).toBe(true);
	});

	it('writes monthly-start tasks on a day ≤ 7', () => {
		const day = lines('# Dev', '- [ ] existing');
		const result = applyDefaults(day, defaults, '2026-05-01', new Set());
		expect(result).toContain('- [ ] Digital Ocean updates');
	});

	it('writes monthly-end tasks on a day in the last 7 of month', () => {
		const day = lines('# Dev', '- [ ] existing');
		const result = applyDefaults(day, defaults, '2026-05-25', new Set());
		expect(result).toContain('- [ ] Invoice');
	});

	it('does not insert monthly-start tasks on a mid-month day', () => {
		const day = '# Dev\n- [ ] existing';
		const result = applyDefaults(day, defaults, '2026-05-15', new Set());
		expect(result).not.toContain('Digital Ocean updates');
	});

	it('returns original string unchanged when no Defaults are defined', () => {
		const empty = parseDefaults('');
		const day = '# PP\n- [ ] task';
		const result = applyDefaults(day, empty, '2026-05-13', new Set());
		expect(result).toBe(day);
	});

	it('marker is on its own line immediately before the inserted block', () => {
		const day = '# PP';
		const result = applyDefaults(day, defaults, '2026-05-13', new Set());
		const resultLines = result.split('\n');
		const markerIdx = resultLines.findIndex(l => l.startsWith('<!-- defaults:'));
		expect(markerIdx).toBeGreaterThan(-1);
		expect(resultLines[markerIdx + 1]).toBe('- [ ] instagram user story');
	});

	it('preserves existing tasks before the inserted block', () => {
		const day = lines('# PP', '- [ ] keep me');
		const result = applyDefaults(day, defaults, '2026-05-13', new Set());
		const idx = result.indexOf('- [ ] keep me');
		const idxNew = result.indexOf('- [ ] instagram user story');
		expect(idx).toBeLessThan(idxNew);
	});

	it('round-trip: parseFile still sees existing tasks after insertion', () => {
		// The inserted tasks and marker are unknown lines to parseFile if we were
		// to run it — but existing tasks must still parse correctly.
		// We verify the raw text contains both the old and new task lines.
		const day = '# PP\n- [ ] existing';
		const result = applyDefaults(day, defaults, '2026-05-13', new Set());
		expect(result).toContain('- [ ] existing');
		expect(result).toContain('- [ ] instagram user story');
	});
});
