/**
 * Re-derive a task's line range from freshly-read file text by stable
 * identity, so splice-based mutations never trust a `lineRange` captured at
 * render time.
 *
 * Identity is the parent's raw line. The cached `lineRange` is only used to
 * disambiguate when two tasks share an identical raw line. Returns the
 * freshly-parsed Task (with correct lineRange and children), or null when
 * the line is genuinely gone (file changed under us).
 *
 * Matching is two-tier: first an exact raw match, then — if that fails —
 * a trimmed match. The trimmed tier makes relocation resilient to
 * whitespace/line-ending normalization by Obsidian or iCloud (CRLF→LF,
 * trailing-space trim): a task the user still sees on disk should still be
 * locatable even if its cached raw differs from the disk line by trivia.
 * The returned task always carries the disk-exact raw, so write-back stays
 * line-preserving. A genuine content change (title edited elsewhere) still
 * fails both tiers and aborts safely.
 *
 * This is the guard against Bug 03 (vanishing tasks): every deletion splice
 * must relocate against the just-read content before touching a line index.
 *
 * @param content - Raw file text read from disk immediately before this call.
 * @param task    - The task whose range to re-derive (carries the cached hint).
 */
export function relocateTask(content: string, task: Task): Task | null {
	const fresh = parseFile(content, task.file);
	const exact = fresh.filter((t) => t.raw === task.raw);
	const matches = exact.length > 0 ? exact : fresh.filter(
		(t) => t.raw.trim() === task.raw.trim(),
	);
	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0];
	// Disambiguate duplicate raw lines by proximity to the cached index.
	const cached = task.lineRange[0];
	return matches.reduce((best, t) =>
		Math.abs(t.lineRange[0] - cached) <=
		Math.abs(best.lineRange[0] - cached)
			? t
			: best,
	);
}

/**
 * Re-derive a child task's line index from freshly-read file text by stable
 * identity. Locates the parent by `task.raw`, then the child by `child.raw`
 * among that parent's freshly-parsed children. Returns the fresh ChildTask
 * (with the correct `lineIndex`), or null when either the parent or the
 * child line is no longer present (file changed under us).
 *
 * @param content - Raw file text read from disk immediately before this call.
 * @param task    - Parent task (carries the cached lineRange hint).
 * @param child   - Child whose lineIndex to re-derive.
 */
export function relocateChild(
	content: string,
	task: Task,
	child: ChildTask,
): ChildTask | null {
	const parent = relocateTask(content, task);
	if (!parent) return null;
	const exact = parent.children.filter((c) => c.raw === child.raw);
	const matches = exact.length > 0 ? exact : parent.children.filter(
		(c) => c.raw.trim() === child.raw.trim(),
	);
	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0];
	const cached = child.lineIndex;
	return matches.reduce((best, c) =>
		Math.abs(c.lineIndex - cached) <= Math.abs(best.lineIndex - cached)
			? c
			: best,
	);
}

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

import type { Task, ChildTask, TaskStatus } from "../types.js";
import { WEEK_MARKER_RE } from "./serialize.js";

const H1_RE = /^#\s+(.+)/;
const TASK_RE = /^(\s*)-\s*\[([ xX>-])\]\s*(.*)/;
const DUR_RE = /\s+(\d*\.?\d+)\s*(h|m)$/i;
const STAR_RE = /^\*\*(.+)\*\*$/;

/** Parse trailing duration token, e.g. "1h", "30m", "1.5h". */
function parseDuration(text: string): {
	title: string;
	estimateMin: number | null;
} {
	const m = text.match(DUR_RE);
	if (!m) return { title: text.trim(), estimateMin: null };

	const v = parseFloat(m[1]);
	const unit = m[2].toLowerCase();
	const min = unit === "h" ? Math.round(v * 60) : Math.round(v);
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
	const lines = content.split("\n");
	const tasks: Task[] = [];

	const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
	const date = dateMatch ? dateMatch[1] : null;

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

		// `## Added week of YYYY-MM-DD` is a chronological boundary heading,
		// not a category — reset the category so tasks under it are
		// uncategorized even when a later H1 section appears above them.
		if (WEEK_MARKER_RE.test(line.trim())) {
			category = null;
			i++;
			continue;
		}

		const tm = line.match(TASK_RE);
		if (!tm) {
			i++;
			continue;
		}

		const indent = tm[1].length;
		const rawCheck = tm[2];
		const status: TaskStatus =
			rawCheck === " " ? "todo" : rawCheck === "-" || rawCheck === ">" ? "in-progress" : "done";
		const rest = tm[3];

		// Only process top-level (non-indented) task lines here.
		// Indented lines are collected as children in the inner loop below.
		if (indent > 0) {
			i++;
			continue;
		}

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
			status,
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
				if (childLine.trim() === "") {
					j++;
					continue;
				}
				break;
			}
			// Stop if we hit a top-level task
			if (cm[1].length === 0) break;

			const childRawCheck = cm[2];
			const childStatus: TaskStatus =
				childRawCheck === " "
					? "todo"
					: childRawCheck === "-" || childRawCheck === ">"
						? "in-progress"
						: "done";
			const child: ChildTask = {
				lineIndex: j,
				title: cm[3].trim(),
				status: childStatus,
				raw: childLine,
			};
			task.children.push(child);
			j++;
		}

		task.lineRange = [
			i,
			task.children.length > 0 ? task.children.at(-1)!.lineIndex : i,
		];
		tasks.push(task);
		i = j;
	}

	return tasks;
}
