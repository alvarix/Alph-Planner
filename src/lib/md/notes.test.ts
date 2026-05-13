import { describe, it, expect } from 'vitest';
import { extractNotes, setNotes } from './notes.js';
import { parseFile } from './parse.js';
import { toggleTaskDone } from './serialize.js';

function lines(...args: string[]) { return args.join('\n'); }

describe('extractNotes', () => {
	it('returns empty when no divider', () => {
		const r = extractNotes('# Work\n- [ ] task');
		expect(r.notes).toBe('');
		expect(r.hasDivider).toBe(false);
	});

	it('returns text after ---', () => {
		const src = lines('# Work', '- [ ] task', '---', 'my note', 'second line');
		const r = extractNotes(src);
		expect(r.hasDivider).toBe(true);
		expect(r.notes).toContain('my note');
		expect(r.notes).toContain('second line');
	});

	it('returns empty string when nothing follows ---', () => {
		const r = extractNotes('- [ ] task\n---\n');
		expect(r.hasDivider).toBe(true);
		expect(r.notes).toBe('');
	});
});

describe('setNotes', () => {
	it('appends divider + notes when none exist', () => {
		const result = setNotes('# Work\n- [ ] task', 'hello', false);
		expect(result).toContain('---');
		expect(result).toContain('hello');
	});

	it('replaces existing notes', () => {
		const src    = lines('# Work', '- [ ] task', '---', 'old note');
		const result = setNotes(src, 'new note', true);
		expect(result).toContain('new note');
		expect(result).not.toContain('old note');
	});

	it('strips divider we added when notes cleared', () => {
		const src    = setNotes('- [ ] task', 'hello', false); // app added ---
		const result = setNotes(src, '', false);
		expect(result).not.toContain('---');
	});

	it('keeps user-typed divider when notes cleared', () => {
		const src    = lines('- [ ] task', '---', 'some note');
		const result = setNotes(src, '', true); // hadDividerOnLoad = true
		expect(result).toContain('---');
	});

	it('is idempotent: writing same notes twice is a no-op', () => {
		const src   = '- [ ] task';
		const once  = setNotes(src, 'hello', false);
		const twice = setNotes(once, 'hello', true);
		expect(twice).toBe(once);
	});
});

describe('notes round-trip: task toggle leaves notes untouched', () => {
	it('toggling a task does not change notes block', () => {
		const src = lines(
			'# Work',
			'- [ ] send invoice',
			'---',
			'remember: follow up Friday',
		);
		const tasks   = parseFile(src, '2026-05-13.md');
		const toggled = toggleTaskDone(src, tasks[0]);
		// The notes block should be byte-identical after the checkbox flip.
		const notesBefore = extractNotes(src).notes;
		const notesAfter  = extractNotes(toggled).notes;
		expect(notesAfter).toBe(notesBefore);
	});
});
