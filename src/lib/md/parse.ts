/**
 * Parse a daily MD file or Backlog.md into Task[].
 *
 * Format:
 *   # Category          ← optional H1 sections; tasks below inherit the category
 *   - [ ] **title** 1h  ← top-level task (starred if **bold**)
 *     - [x] subtask     ← indented child (any whitespace indent)
 *
 * All unrecognised lines are preserved verbatim in the serializer — they are
 * simply not returned from parseFile().
 */

import type { Task, ChildTask } from '../types.js';

const H1_RE   = /^#\s+(.+)/;
const TASK_RE = /^(\s*)-\s*\[([ xX])\]\s*(.*)/;
const DUR_RE  = /\s+(\d*\.?\d+)\s*(h|m)$/i;
const STAR_RE = /^\*\*(.+)\*\*$/;

/** Parse trailing duration token, e.g. "1h", "30m", "1.5h". */
function parseDuration(text: string): { title: string; estimateMin: number | null } {
	const m = text.match(DUR_RE);
	if (!m) return { title: text.trim(), estimateMin: null };

	const v    = parseFloat(m[1]);
	const unit = m[2].toLowerCase();
	const min  = unit === 'h' ? Math.round(v * 60) : Math.round(v);
	const estimateMin = min >= 5 && min <= 480 ? min : null;
	return { title: text.slice(0, m.index).trim(), estimateMin };
}

/** Strip **bold** markers and extract starred flag. */
function parseStarred(text: string): { title: string; starred: boolean } {
	const m = text.match(STAR_RE);
	return m
		? { title: m[1].trim(), starred: true }
		: { title: text.trim(), starred: false };
}

/**
 * Parse a daily file or Backlog.md into an array of Tasks.
 *
 * @param content  - Raw file text.
 * @param filename - Bare filename, e.g. "2026-05-12.md" or "Backlog.md".
 */
export function parseFile(content: string, filename: string): Task[] {
	const lines  = content.split('\n');
	const tasks: Task[] = [];

	const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
	const date      = dateMatch ? dateMatch[1] : null;

	let category: string | null = null;
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// H1 → update current category
		const h1 = line.match(H1_RE);
		if (h1) {
			category = h1[1].trim();
			i++;
			continue;
		}

		const tm = line.match(TASK_RE);
		if (!tm) { i++; continue; }

		const indent  = tm[1].length;
		const checked = tm[2].toLowerCase() === 'x';
		const rest    = tm[3];

		// Only process top-level (non-indented) task lines here.
		// Indented lines are collected as children in the inner loop below.
		if (indent > 0) { i++; continue; }

		const { title: withStar, estimateMin } = parseDuration(rest);
		const { title, starred } = parseStarred(withStar);

		const task: Task = {
			file: filename,
			date,
			lineRange: [i, i],
			category,
			title,
			starred,
			estimateMin,
			done: checked,
			children: [],
			raw: line,
		};

		// Collect indented children immediately following this task.
		let j = i + 1;
		while (j < lines.length) {
			const childLine = lines[j];
			const cm = childLine.match(TASK_RE);
			// Stop if non-task line that isn't blank (blank lines allowed between subtasks)
			if (!cm) {
				if (childLine.trim() === '') { j++; continue; }
				break;
			}
			// Stop if we hit a top-level task
			if (cm[1].length === 0) break;

			const child: ChildTask = {
				lineIndex: j,
				title: cm[3].trim(),
				done: cm[2].toLowerCase() === 'x',
				raw: childLine,
			};
			task.children.push(child);
			j++;
		}

		task.lineRange = [i, task.children.length > 0 ? task.children.at(-1)!.lineIndex : i];
		tasks.push(task);
		i = j;
	}

	return tasks;
}
