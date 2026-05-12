import { describe, it, expect } from 'vitest';
import { parseFile } from './parse.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function lines(...args: string[]) {
	return args.join('\n');
}

// ── Basic task parsing ────────────────────────────────────────────────────────

describe('parseFile — basic', () => {
	it('returns empty array for an empty file', () => {
		expect(parseFile('', '2026-05-12.md')).toEqual([]);
	});

	it('parses a plain unchecked task', () => {
		const tasks = parseFile('- [ ] buy milk', '2026-05-12.md');
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe('buy milk');
		expect(tasks[0].done).toBe(false);
		expect(tasks[0].starred).toBe(false);
		expect(tasks[0].estimateMin).toBeNull();
	});

	it('parses a checked task', () => {
		const tasks = parseFile('- [x] buy milk', '2026-05-12.md');
		expect(tasks[0].done).toBe(true);
	});

	it('parses uppercase X as done', () => {
		const tasks = parseFile('- [X] buy milk', '2026-05-12.md');
		expect(tasks[0].done).toBe(true);
	});

	it('infers date from filename', () => {
		const tasks = parseFile('- [ ] task', '2026-05-12.md');
		expect(tasks[0].date).toBe('2026-05-12');
	});

	it('sets date to null for Backlog.md', () => {
		const tasks = parseFile('- [ ] task', 'Backlog.md');
		expect(tasks[0].date).toBeNull();
	});

	it('sets file to the filename', () => {
		const tasks = parseFile('- [ ] task', '2026-05-12.md');
		expect(tasks[0].file).toBe('2026-05-12.md');
	});
});

// ── Starred (bold) ────────────────────────────────────────────────────────────

describe('parseFile — starred', () => {
	it('detects **bold** title as starred', () => {
		const tasks = parseFile('- [ ] **fix taxes**', '2026-05-12.md');
		expect(tasks[0].starred).toBe(true);
		expect(tasks[0].title).toBe('fix taxes');
	});

	it('does not star a task with partial bold markers', () => {
		const tasks = parseFile('- [ ] **fix taxes', '2026-05-12.md');
		expect(tasks[0].starred).toBe(false);
	});
});

// ── Duration ─────────────────────────────────────────────────────────────────

describe('parseFile — duration', () => {
	it('parses hours', () => {
		const tasks = parseFile('- [ ] deep work 2h', '2026-05-12.md');
		expect(tasks[0].estimateMin).toBe(120);
		expect(tasks[0].title).toBe('deep work');
	});

	it('parses minutes', () => {
		const tasks = parseFile('- [ ] standup 30m', '2026-05-12.md');
		expect(tasks[0].estimateMin).toBe(30);
	});

	it('parses fractional hours', () => {
		const tasks = parseFile('- [ ] review 1.5h', '2026-05-12.md');
		expect(tasks[0].estimateMin).toBe(90);
	});

	it('returns null estimateMin when no duration', () => {
		const tasks = parseFile('- [ ] call mom', '2026-05-12.md');
		expect(tasks[0].estimateMin).toBeNull();
	});

	it('combines starred and duration', () => {
		const tasks = parseFile('- [ ] **ship invoice** 1h', '2026-05-12.md');
		expect(tasks[0].starred).toBe(true);
		expect(tasks[0].title).toBe('ship invoice');
		expect(tasks[0].estimateMin).toBe(60);
	});
});

// ── Categories (H1 sections) ──────────────────────────────────────────────────

describe('parseFile — categories', () => {
	it('assigns category from H1 above the task', () => {
		const src = lines('# Work', '- [ ] email client');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks[0].category).toBe('Work');
	});

	it('sets category to null for tasks before any H1', () => {
		const src = lines('- [ ] uncategorized', '# Work', '- [ ] email client');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks[0].category).toBeNull();
		expect(tasks[1].category).toBe('Work');
	});

	it('updates category when a new H1 appears', () => {
		const src = lines('# Work', '- [ ] task a', '# Personal', '- [ ] task b');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks[0].category).toBe('Work');
		expect(tasks[1].category).toBe('Personal');
	});
});

// ── Subtasks (children) ───────────────────────────────────────────────────────

describe('parseFile — subtasks', () => {
	it('collects indented children', () => {
		const src = lines('- [ ] groceries', '  - [ ] milk', '  - [x] eggs');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks).toHaveLength(1);
		expect(tasks[0].children).toHaveLength(2);
		expect(tasks[0].children[0].title).toBe('milk');
		expect(tasks[0].children[0].done).toBe(false);
		expect(tasks[0].children[1].title).toBe('eggs');
		expect(tasks[0].children[1].done).toBe(true);
	});

	it('lineRange covers parent and all children', () => {
		const src = lines('- [ ] groceries', '  - [ ] milk', '  - [ ] eggs');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks[0].lineRange).toEqual([0, 2]);
	});

	it('child lineIndex points to the correct line', () => {
		const src = lines('- [ ] groceries', '  - [ ] milk', '  - [ ] eggs');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks[0].children[0].lineIndex).toBe(1);
		expect(tasks[0].children[1].lineIndex).toBe(2);
	});

	it('next top-level task starts after children', () => {
		const src = lines('- [ ] a', '  - [ ] child', '- [ ] b');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks).toHaveLength(2);
		expect(tasks[1].title).toBe('b');
	});
});

// ── lineRange ─────────────────────────────────────────────────────────────────

describe('parseFile — lineRange', () => {
	it('lineRange [n,n] for a task with no children', () => {
		const src = lines('- [ ] solo');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks[0].lineRange).toEqual([0, 0]);
	});

	it('lineRange accounts for line position in multi-task file', () => {
		const src = lines('- [ ] first', '- [ ] second');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks[0].lineRange).toEqual([0, 0]);
		expect(tasks[1].lineRange).toEqual([1, 1]);
	});
});

// ── Unknown lines preserved (round-trip) ─────────────────────────────────────

describe('parseFile — unknown lines', () => {
	it('ignores Obsidian embed syntax without corrupting other tasks', () => {
		const src = lines('![[Backlog]]', '- [ ] real task');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe('real task');
	});

	it('ignores blank lines between tasks', () => {
		const src = lines('- [ ] a', '', '- [ ] b');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks).toHaveLength(2);
	});

	it('ignores free-text lines', () => {
		const src = lines('some prose', '- [ ] task', 'more prose');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks).toHaveLength(1);
	});

	it('preserves raw line on each task', () => {
		const raw = '- [ ] **ship invoice** 1h';
		const tasks = parseFile(raw, '2026-05-12.md');
		expect(tasks[0].raw).toBe(raw);
	});

	it('preserves raw line on each child', () => {
		const src = lines('- [ ] groceries', '  - [ ] milk');
		const tasks = parseFile(src, '2026-05-12.md');
		expect(tasks[0].children[0].raw).toBe('  - [ ] milk');
	});
});
