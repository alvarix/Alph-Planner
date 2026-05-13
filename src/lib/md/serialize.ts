/**
 * Line-preserving write-back for daily MD files.
 *
 * Every function takes the raw file text plus the minimum information needed
 * to locate and mutate a single line range. All other lines — blank lines,
 * free text, frontmatter, ![[embeds]] — pass through byte-identical.
 *
 * None of these functions do I/O. Call readFile → mutate → writeFile.
 */

import type { Task, ChildTask } from '../types.js';

// ── Internal helpers ─────────────────────────────────────────────────────────

function splitLines(content: string): string[] {
	return content.split('\n');
}

function joinLines(lines: string[]): string {
	return lines.join('\n');
}

/** Flip `[ ]` ↔ `[x]` on a single line, leaving everything else intact. */
function flipCheckbox(line: string, done: boolean): string {
	return done
		? line.replace(/\[\s\]/, '[x]')
		: line.replace(/\[x\]/i, '[ ]');
}

// ── Exported mutations ────────────────────────────────────────────────────────

/**
 * Toggle the done state of a top-level task.
 * Only mutates the task's own line (lineRange[0]); children are untouched.
 *
 * @param content - Raw file text.
 * @param task    - The task to toggle.
 * @returns New file text.
 */
export function toggleTaskDone(content: string, task: Task): string {
	const lines = splitLines(content);
	lines[task.lineRange[0]] = flipCheckbox(lines[task.lineRange[0]], !task.done);
	return joinLines(lines);
}

/**
 * Toggle the done state of a subtask (child).
 * Only mutates the child's own line.
 *
 * @param content - Raw file text.
 * @param child   - The child task to toggle.
 * @returns New file text.
 */
export function toggleChildDone(content: string, child: ChildTask): string {
	const lines = splitLines(content);
	lines[child.lineIndex] = flipCheckbox(lines[child.lineIndex], !child.done);
	return joinLines(lines);
}

/**
 * Reorder tasks within a file by moving one task block (parent + children)
 * to a new position among the top-level tasks.
 *
 * Tasks not in the provided array are left in place (unknown lines preserved).
 *
 * @param content   - Raw file text.
 * @param tasks     - The current ordered Task[] for this file (from parseFile).
 * @param fromIndex - Index in tasks[] of the task being moved.
 * @param toIndex   - Target index in tasks[] after the move.
 * @returns New file text.
 */
export function reorderTasks(
	content: string,
	tasks: Task[],
	fromIndex: number,
	toIndex: number
): string {
	if (fromIndex === toIndex) return content;

	const lines = splitLines(content);

	// Extract each task's line block (parent line + child lines).
	type Block = { lines: string[]; start: number; end: number };
	const blocks: Block[] = tasks.map(t => ({
		lines: lines.slice(t.lineRange[0], t.lineRange[1] + 1),
		start: t.lineRange[0],
		end:   t.lineRange[1],
	}));

	// Reorder the blocks array.
	const moved = blocks.splice(fromIndex, 1)[0];
	blocks.splice(toIndex, 0, moved);

	// Rebuild: preserve every line outside known task ranges, replace task ranges
	// with the reordered blocks in sequence.
	const taskLines = new Set<number>();
	tasks.forEach(t => {
		for (let i = t.lineRange[0]; i <= t.lineRange[1]; i++) taskLines.add(i);
	});

	const result: string[] = [];
	let blockIdx = 0;
	let i = 0;

	while (i < lines.length) {
		if (!taskLines.has(i)) {
			result.push(lines[i]);
			i++;
		} else {
			// We're at the start of a task block region — emit the next reordered block.
			const block = blocks[blockIdx++];
			result.push(...block.lines);
			// Advance past all task lines in this region.
			const origBlock = tasks[blockIdx - 1] ?? tasks.at(-1)!;
			// Jump i past the original task's line range.
			const originalTask = tasks.find(t => t.lineRange[0] === i);
			if (originalTask) {
				i = originalTask.lineRange[1] + 1;
			} else {
				i++;
			}
		}
	}

	return joinLines(result);
}

/**
 * Append a new task line to the end of a section (or file).
 * Inserts before the next H1 section if one follows, otherwise at end of file.
 *
 * @param content  - Raw file text.
 * @param taskLine - The raw markdown line to append, e.g. "- [ ] buy milk".
 * @param category - If provided, append under the matching H1 section.
 * @returns New file text.
 */
export function appendTask(content: string, taskLine: string, category: string | null): string {
	const lines = splitLines(content);

	if (!category) {
		// No category — append at end of file (before any trailing blank lines).
		let insertAt = lines.length;
		while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
		lines.splice(insertAt, 0, taskLine);
		return joinLines(lines);
	}

	// Find the matching H1 and insert before the next H1 (or end of file).
	const h1Pattern = /^#\s+(.+)/;
	let inSection = false;
	let insertAt = lines.length;

	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(h1Pattern);
		if (m) {
			if (inSection) { insertAt = i; break; }
			if (m[1].trim() === category) inSection = true;
		}
	}

	// insertAt now points to the line after the last item in the section.
	// Walk back past trailing blanks to keep spacing tidy.
	while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
	lines.splice(insertAt, 0, taskLine);
	return joinLines(lines);
}

/**
 * Append a new H1 category header at the end of the file.
 * Adds a blank separator line before the heading if the file is non-empty.
 *
 * @param content - Raw file text.
 * @param name    - Category name, e.g. "Work".
 * @returns New file text.
 */
export function addCategoryHeader(content: string, name: string): string {
	const lines = splitLines(content);
	let end = lines.length;
	while (end > 0 && lines[end - 1].trim() === '') end--;
	const insert = end > 0 ? ['', `# ${name}`] : [`# ${name}`];
	lines.splice(end, 0, ...insert);
	return joinLines(lines);
}

/**
 * Remove an H1 category header line from the file.
 * Tasks that were under the header remain — they just lose their section label.
 *
 * @param content - Raw file text.
 * @param name    - Category name to remove, e.g. "Work".
 * @returns New file text.
 */
export function removeCategoryHeader(content: string, name: string): string {
	const h1Pat = /^#\s+(.+)/;
	return joinLines(
		splitLines(content).filter(l => {
			const m = l.match(h1Pat);
			return !(m && m[1].trim() === name);
		})
	);
}
