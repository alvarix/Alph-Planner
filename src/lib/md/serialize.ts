/**
 * Line-preserving write-back for daily MD files.
 *
 * Every function takes the raw file text plus the minimum information needed
 * to locate and mutate a single line range. All other lines — blank lines,
 * free text, frontmatter, ![[embeds]] — pass through byte-identical.
 *
 * None of these functions do I/O. Call readFile → mutate → writeFile.
 */

import type { Task, ChildTask, TaskStatus } from "../types.js";

// ── Internal helpers ─────────────────────────────────────────────────────────

function splitLines(content: string): string[] {
	return content.split("\n");
}

function joinLines(lines: string[]): string {
	return lines.join("\n");
}

/**
 * Detect the current checkbox state from a task line and return the next
 * status in the cycle: todo → in-progress → done → todo.
 *
 * In-progress is written as `[>]`. The legacy `[-]` is still recognised as
 * in-progress so files created before the switch keep working.
 */
function nextStatusFromLine(line: string): TaskStatus {
	if (/\[\s\]/.test(line)) return "in-progress";
	if (/\[[>-]\]/.test(line)) return "done";
	return "todo";
}

/** Regex that a valid task line must match after checkbox mutation. */
const VALID_TASK_LINE = /^(\s*-\s*\[[ xX>-]\]\s*)/;

/** Any accepted in-progress marker (modern `[>]`, legacy `[-]`). */
const IN_PROGRESS_RE = /\[[>-]\]/;

/**
 * Cycle the checkbox on a single line through the tri-state:
 * [ ] → [>] → [x] → [ ]
 *
 * If the result would be an invalid task line (missing closing bracket),
 * the original line is returned unchanged as a safety guard.
 */
function cycleCheckbox(line: string): string {
	const next = nextStatusFromLine(line);
	const result =
		next === "in-progress"
			? line.replace(/\[\s\]/, "[>]")
			: next === "done"
				? line.replace(IN_PROGRESS_RE, "[x]")
				: line.replace(/\[x\]/i, "[ ]");
	// Safety guard: if the result doesn't look like a valid task line,
	// return the original line unchanged — prevents data corruption
	// from stale lineRange or unexpected line content.
	if (!VALID_TASK_LINE.test(result)) {
		console.error(
			"[cycleCheckbox] produced invalid task line — returning original",
			{
				input: line,
				output: result,
			},
		);
		return line;
	}
	return result;
}

// ── Week-boundary markers ─────────────────────────────────────────────────────

/**
 * Matches the visible week-boundary heading written to Backlog.md, e.g.
 * `## Added week of 2026-08-03`. An H2 heading is deliberate: H1 headings are
 * category sections, and `---` is the notes divider, so H2 is the only
 * unambiguous visible marker slot.
 */
export const WEEK_MARKER_RE = /^##\s+Added week of\s+(\d{4}-\d{2}-\d{2})\s*$/;

/**
 * Insert a task block (parent + children lines) under a `## Added week of`
 * boundary heading, creating the heading if it doesn't exist yet.
 *
 * Appending to an existing heading keeps blocks directly under it, one task
 * per line, no blank lines between tasks. Creating a heading places it in
 * chronological order (before any later-dated heading, otherwise at the end
 * of the file, before the notes `---` divider) with blank-line separation.
 *
 * @param content   - Raw file text (usually Backlog.md).
 * @param taskBlock - One or more raw markdown task lines, newline-joined.
 * @param mondayISO - Monday date of the week, "YYYY-MM-DD".
 * @returns New file text.
 */
export function insertUnderWeekMarker(
	content: string,
	taskBlock: string,
	mondayISO: string,
): string {
	const lines = splitLines(content);
	const target = `## Added week of ${mondayISO}`;

	// Locate every week heading and the exact one for this week.
	const markers: number[] = [];
	lines.forEach((l, i) => {
		if (WEEK_MARKER_RE.test(l.trim())) markers.push(i);
	});
	const exact = markers.find((i) => lines[i].trim() === target);

	if (exact !== undefined) {
		// Section ends at the next week heading, the notes divider, or EOF.
		let end = lines.length;
		const next = markers.find((i) => i > exact);
		if (next !== undefined) end = next;
		const div = lines.findIndex((l, i) => i > exact && /^---\s*$/.test(l));
		if (div !== -1) end = Math.min(end, div);
		// Walk back past trailing blanks so blocks sit directly under the
		// previous task in the section (no blank lines between tasks).
		let insertAt = end;
		while (insertAt > exact && lines[insertAt - 1].trim() === "") insertAt--;
		lines.splice(insertAt, 0, taskBlock);
		return joinLines(lines);
	}

	// No heading for this week yet — create it in chronological position:
	// before the first later-dated heading, otherwise at the end of the file
	// (before the notes divider, after any trailing blank lines).
	const later = markers.find((i) => {
		const m = lines[i].trim().match(WEEK_MARKER_RE);
		return m ? m[1] > mondayISO : false;
	});

	let insertAt: number;
	if (later !== undefined) {
		insertAt = later;
	} else {
		insertAt = lines.length;
		const div = lines.findIndex((l) => /^---\s*$/.test(l));
		if (div !== -1) insertAt = div;
		while (insertAt > 0 && lines[insertAt - 1].trim() === "") insertAt--;
	}

	// Build the heading + block with blank-line separation from neighbours.
	const before = insertAt > 0 ? lines[insertAt - 1] : undefined;
	const after = insertAt < lines.length ? lines[insertAt] : undefined;
	const insertion: string[] = [];
	if (before !== undefined && before.trim() !== "") insertion.push("");
	insertion.push(target, taskBlock);
	if (after !== undefined && after.trim() !== "") insertion.push("");
	lines.splice(insertAt, 0, ...insertion);
	return joinLines(lines);
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
	lines[task.lineRange[0]] = cycleCheckbox(lines[task.lineRange[0]]);
	return joinLines(lines);
}

/**
 * Force a task's parent line to the given status, ignoring the tri-state cycle.
 * Used for long-press completion (skips in-progress → done).
 *
 * @param content - Raw file text.
 * @param task    - The task to update.
 * @param status  - Target checkbox state.
 * @returns New file text.
 */
export function setTaskDone(
	content: string,
	task: Task,
	status: TaskStatus,
): string {
	const lines = splitLines(content);
	lines[task.lineRange[0]] = setTaskLineStatus(
		lines[task.lineRange[0]],
		status,
	);
	return joinLines(lines);
}

/**
 * Set a task's parent line to a specific status without cycling.
 * Used for auto-status propagation from children to parent.
 *
 * @param line   - The task's parent markdown line.
 * @param status - Target checkbox state.
 * @returns The line with the checkbox replaced.
 */
export function setTaskLineStatus(line: string, status: TaskStatus): string {
	if (status === "in-progress")
		return line.replace(/\[[ xX>-]\]/, "[>]");
	if (status === "done")
		return line.replace(/\[[ xX>-]\]/, "[x]");
	return line.replace(/\[[ xX>-]\]/, "[ ]");
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
	lines[child.lineIndex] = cycleCheckbox(lines[child.lineIndex]);
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
	toIndex: number,
): string {
	if (fromIndex === toIndex) return content;

	const lines = splitLines(content);

	// Extract each task's line block (parent line + child lines).
	type Block = { lines: string[]; start: number; end: number };
	const blocks: Block[] = tasks.map((t) => ({
		lines: lines.slice(t.lineRange[0], t.lineRange[1] + 1),
		start: t.lineRange[0],
		end: t.lineRange[1],
	}));

	// Reorder the blocks array.
	const moved = blocks.splice(fromIndex, 1)[0];
	blocks.splice(toIndex, 0, moved);

	// Rebuild: preserve every line outside known task ranges, replace task ranges
	// with the reordered blocks in sequence.
	const taskLines = new Set<number>();
	tasks.forEach((t) => {
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
			const originalTask = tasks.find((t) => t.lineRange[0] === i);
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
export function appendTask(
	content: string,
	taskLine: string,
	category: string | null,
): string {
	const lines = splitLines(content);

	if (!category) {
		const firstH1 = lines.findIndex((l) => /^#\s+/.test(l));
		if (firstH1 === -1) {
			// No H1 exists — insert at end of file, before trailing blanks.
			let insertAt = lines.length;
			while (insertAt > 0 && lines[insertAt - 1].trim() === "") insertAt--;
			lines.splice(insertAt, 0, taskLine);
		} else {
			// Insert just before the first H1, walking back past any blank lines
			// so the task groups with other uncategorised items, not whitespace.
			let insertAt = firstH1;
			while (insertAt > 0 && lines[insertAt - 1].trim() === "") insertAt--;
			lines.splice(insertAt, 0, taskLine);
		}
		return joinLines(lines);
	}

	// Find the matching H1 and insert before the next H1, week-boundary
	// heading, or notes divider (or end of file). Week headings and the
	// divider must end the section, otherwise categorized tasks would land
	// below the chronological rollover sections at the bottom of the file.
	const h1Pattern = /^#\s+(.+)/;
	let inSection = false;
	let insertAt = lines.length;

	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(h1Pattern);
		if (m) {
			if (inSection) {
				insertAt = i;
				break;
			}
			if (m[1].trim() === category) inSection = true;
			continue;
		}
		if (
			inSection &&
			(WEEK_MARKER_RE.test(lines[i].trim()) || /^---\s*$/.test(lines[i]))
		) {
			insertAt = i;
			break;
		}
	}

	// insertAt now points to the line after the last item in the section.
	// Walk back past trailing blanks to keep spacing tidy.
	while (insertAt > 0 && lines[insertAt - 1].trim() === "") insertAt--;
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
	// Categories sit above the chronological rollover sections, so insert
	// before the first week-boundary heading when one exists.
	const markerIdx = lines.findIndex((l) => WEEK_MARKER_RE.test(l.trim()));
	let end = markerIdx === -1 ? lines.length : markerIdx;
	while (end > 0 && lines[end - 1].trim() === "") end--;
	const insert = end > 0 ? ["", `# ${name}`] : [`# ${name}`];
	lines.splice(end, 0, ...insert);
	return joinLines(lines);
}

/**
 * Reorder H1 category sections within a file.
 * Everything after the first `---` divider (notes) is preserved at the end.
 * Empty categories and their blank lines move with their header.
 *
 * @param content   - Raw file text.
 * @param fromIndex - Index of the category to move (0-based, among H1 sections).
 * @param toIndex   - Target index after the move.
 * @returns New file text.
 */
export function reorderCategories(
	content: string,
	fromIndex: number,
	toIndex: number,
): string {
	if (fromIndex === toIndex) return content;

	const lines = splitLines(content);

	// Preserve notes (everything from first `---` line onward).
	const divIdx = lines.findIndex((l) => /^---\s*$/.test(l));
	const mainLines = divIdx === -1 ? lines : lines.slice(0, divIdx);
	const tailLines = divIdx === -1 ? [] : lines.slice(divIdx);

	// Partition into pre-H1 content and H1 sections.
	type Section = { header: string; body: string[] };
	const sections: Section[] = [];
	const pre: string[] = [];
	let cur: Section | null = null;

	for (const line of mainLines) {
		if (/^#\s+/.test(line)) {
			if (cur) sections.push(cur);
			cur = { header: line, body: [] };
		} else if (cur) {
			cur.body.push(line);
		} else {
			pre.push(line);
		}
	}
	if (cur) sections.push(cur);

	// Reorder.
	const [moved] = sections.splice(fromIndex, 1);
	sections.splice(toIndex, 0, moved);

	// Reassemble.
	const result = [...pre];
	for (const s of sections) {
		result.push(s.header, ...s.body);
	}

	return joinLines([...result, ...tailLines]);
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
		splitLines(content).filter((l) => {
			const m = l.match(h1Pat);
			return !(m && m[1].trim() === name);
		}),
	);
}
