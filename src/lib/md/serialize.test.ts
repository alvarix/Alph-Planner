import { describe, it, expect } from 'vitest';
import { parseFile } from './parse.js';
import { toggleTaskDone, toggleChildDone, reorderTasks, appendTask } from './serialize.js';

function lines(...args: string[]) { return args.join('\n'); }

// ── Round-trip invariant ──────────────────────────────────────────────────────

describe('round-trip', () => {
	it('parse → serialize with no mutation = byte-identical', () => {
		const src = lines(
			'![[Backlog]]',
			'',
			'# Work',
			'- [ ] **ship invoice** 1h',
			'  - [ ] draft',
			'  - [x] send',
			'',
			'# Personal',
			'- [x] gym',
			'- [ ] groceries',
		);
		const tasks = parseFile(src, '2026-05-12.md');
		// No mutation — run toggleTaskDone and immediately undo it (done→done→done)
		// to confirm lines other than the target are untouched.
		const toggled = toggleTaskDone(src, tasks[0]);      // uncheck ship invoice
		const restored = toggleTaskDone(toggled, { ...tasks[0], done: true }); // re-check
		expect(restored).toBe(src);
	});

	it('unknown lines survive toggleTaskDone', () => {
		const src = lines('![[Backlog]]', '- [ ] task a', 'some prose', '- [ ] task b');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = toggleTaskDone(src, tasks[0]);
		const resultLines = result.split('\n');
		expect(resultLines[0]).toBe('![[Backlog]]');
		expect(resultLines[2]).toBe('some prose');
	});
});

// ── toggleTaskDone ────────────────────────────────────────────────────────────

describe('toggleTaskDone', () => {
	it('marks an unchecked task done', () => {
		const src  = '- [ ] buy milk';
		const task = parseFile(src, '2026-05-12.md')[0];
		expect(toggleTaskDone(src, task)).toBe('- [x] buy milk');
	});

	it('marks a checked task undone', () => {
		const src  = '- [x] buy milk';
		const task = parseFile(src, '2026-05-12.md')[0];
		expect(toggleTaskDone(src, task)).toBe('- [ ] buy milk');
	});

	it('only changes the target line', () => {
		const src   = lines('- [ ] a', '- [ ] b', '- [ ] c');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = toggleTaskDone(src, tasks[1]).split('\n');
		expect(result[0]).toBe('- [ ] a');
		expect(result[1]).toBe('- [x] b');
		expect(result[2]).toBe('- [ ] c');
	});

	it('does not affect child lines', () => {
		const src   = lines('- [ ] parent', '  - [ ] child');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = toggleTaskDone(src, tasks[0]).split('\n');
		expect(result[1]).toBe('  - [ ] child');
	});
});

// ── toggleChildDone ───────────────────────────────────────────────────────────

describe('toggleChildDone', () => {
	it('marks a child done', () => {
		const src   = lines('- [ ] groceries', '  - [ ] milk', '  - [ ] eggs');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = toggleChildDone(src, tasks[0].children[0]);
		expect(result.split('\n')[1]).toBe('  - [x] milk');
	});

	it('does not affect the parent line', () => {
		const src   = lines('- [ ] groceries', '  - [ ] milk');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = toggleChildDone(src, tasks[0].children[0]);
		expect(result.split('\n')[0]).toBe('- [ ] groceries');
	});

	it('marks a child undone', () => {
		const src   = lines('- [ ] groceries', '  - [x] milk');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = toggleChildDone(src, tasks[0].children[0]);
		expect(result.split('\n')[1]).toBe('  - [ ] milk');
	});
});

// ── reorderTasks ──────────────────────────────────────────────────────────────

describe('reorderTasks', () => {
	it('moves a task down', () => {
		const src   = lines('- [ ] a', '- [ ] b', '- [ ] c');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = reorderTasks(src, tasks, 0, 2).split('\n');
		expect(result[0]).toBe('- [ ] b');
		expect(result[1]).toBe('- [ ] c');
		expect(result[2]).toBe('- [ ] a');
	});

	it('moves a task up', () => {
		const src   = lines('- [ ] a', '- [ ] b', '- [ ] c');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = reorderTasks(src, tasks, 2, 0).split('\n');
		expect(result[0]).toBe('- [ ] c');
		expect(result[1]).toBe('- [ ] a');
		expect(result[2]).toBe('- [ ] b');
	});

	it('moves a task block (parent + children) together', () => {
		const src = lines('- [ ] a', '  - [ ] a-child', '- [ ] b');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = reorderTasks(src, tasks, 0, 1).split('\n');
		expect(result[0]).toBe('- [ ] b');
		expect(result[1]).toBe('- [ ] a');
		expect(result[2]).toBe('  - [ ] a-child');
	});

	it('no-op when fromIndex === toIndex', () => {
		const src   = lines('- [ ] a', '- [ ] b');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(reorderTasks(src, tasks, 0, 0)).toBe(src);
	});

	it('preserves unknown lines outside task ranges', () => {
		const src   = lines('# Work', '- [ ] a', '- [ ] b', 'some note');
		const tasks = parseFile(src, '2026-05-12.md');
		const result = reorderTasks(src, tasks, 0, 1);
		expect(result).toContain('# Work');
		expect(result).toContain('some note');
	});
});

// ── appendTask ────────────────────────────────────────────────────────────────

describe('appendTask', () => {
	it('appends to end of file when no category', () => {
		const src    = '- [ ] existing';
		const result = appendTask(src, '- [ ] new', null).split('\n');
		expect(result.at(-1)).toBe('- [ ] new');
	});

	it('appends under the matching H1 section', () => {
		const src = lines('# Work', '- [ ] task a', '# Personal', '- [ ] task b');
		const result = appendTask(src, '- [ ] task c', 'Work').split('\n');
		expect(result[0]).toBe('# Work');
		expect(result[1]).toBe('- [ ] task a');
		expect(result[2]).toBe('- [ ] task c');
		expect(result[3]).toBe('# Personal');
	});
});
