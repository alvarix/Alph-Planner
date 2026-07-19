/**
 * In-memory cache of parsed daily files.
 * Source of truth is always the disk. This cache is rebuilt on every
 * window focus and after every write.
 */

import { parseFile } from "./md/parse.js";
import {
	toggleTaskDone,
	toggleChildDone,
	reorderTasks,
	reorderCategories,
	appendTask,
	addCategoryHeader,
	removeCategoryHeader,
} from "./md/serialize.js";
import { extractNotes, setNotes } from "./md/notes.js";
import {
	readFile,
	writeFile,
	listDailyFiles,
	detectConflicts,
	readDefaultsFile,
	classifyFolderError,
	FsError,
} from "./fs/files.js";
import { parseDefaults, applyDefaults } from "./md/defaults.js";
import { clearHandle } from "./fs/handle-store.js";
import type { Task, ChildTask } from "./types.js";
import type { FolderState } from "./fs/folder.js";

interface FileCache {
	[filename: string]: Task[];
}

interface NotesEntry {
	text: string;
	hadDividerOnLoad: boolean;
}

interface AppState {
	folder: FolderState;
	cache: FileCache;
	fileHeaders: Record<string, string[]>;
	notesCache: Record<string, NotesEntry>;
	backlogHeaders: string[];
	loading: boolean;
	conflicts: string[];
	weekOffset: number;
	lastError: string | null;
	/** Period keys already inserted this session — prevents multi-file insertion. */
	defaultsApplied: Set<string>;
	/** Consecutive refresh failures. Reset on successful refresh. */
	refreshFailCount: number;
	/** Reason for the last failed refresh (null when last refresh succeeded). */
	lastRefreshError: import("./fs/folder.js").FolderErrorReason | null;
}

/** Template written when the app creates a new daily file from scratch. */
const NEW_DAILY_TEMPLATE = "![[Backlog]]\n\n";

export const appState = $state<AppState>({
	folder: { status: "none" },
	cache: {},
	fileHeaders: {},
	notesCache: {},
	backlogHeaders: [],
	loading: false,
	conflicts: [],
	weekOffset: 0,
	lastError: null,
	defaultsApplied: new Set(),
	refreshFailCount: 0,
	lastRefreshError: null,
});

/** Extract all # H1 section names from raw file text. */
export function extractH1s(content: string): string[] {
	return content
		.split("\n")
		.map((l) => l.match(/^#\s+(.+)/)?.[1]?.trim())
		.filter((h): h is string => !!h);
}

function fail(msg: string) {
	appState.lastError = msg;
}

/** True when a folder is ready to read. */
export function folderReady(): boolean {
	return appState.folder.status === "ready";
}

/** The active directory handle, or null. */
function dir(): FileSystemDirectoryHandle | null {
	return appState.folder.status === "ready" ? appState.folder.handle : null;
}

/**
 * Refresh the in-memory cache from disk.
 * Called on window focus and after every write.
 */
export async function refresh(): Promise<void> {
	const d = dir();
	if (!d) return;

	appState.loading = true;
	try {
		const filenames = await listDailyFiles(d);

		const rawTexts: [string, string | null][] = await Promise.all(
			filenames.map(
				async (name) =>
					[name, await readFile(d, name)] as [string, string | null],
			),
		);

		// Apply recurring default tasks to any day files that haven't received them yet.
		const defaultsText = await readDefaultsFile(d);
		if (defaultsText) {
			const defaults = parseDefaults(defaultsText);
			// All applyDefaults calls are synchronous; writes are sequential via await.
			for (const entry of rawTexts) {
				const [name, text] = entry;
				const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
				if (!dateMatch || !text) continue;
				const updated = applyDefaults(
					text,
					defaults,
					dateMatch[1],
					appState.defaultsApplied,
				);
				if (updated !== text) {
					try {
						await writeFile(d, name, updated);
						entry[1] = updated;
					} catch (err) {
						// Non-fatal: file may be temporarily locked (e.g. iCloud sync).
						// Skip this file's defaults insertion; it will be retried on next refresh.
						console.warn("[refresh:applyDefaults] skipping locked file", {
							name,
							err,
						});
					}
				}
			}
		}

		appState.cache = Object.fromEntries(
			rawTexts.map(([name, text]) => [name, text ? parseFile(text, name) : []]),
		);

		// ── Mark default-inserted tasks so they can be excluded from overdue ──
		if (defaultsText) {
			const defaults = parseDefaults(defaultsText);
			const defaultsTemplateLines = new Set<string>();
			for (const cadence of ["weekly", "monthlyStart", "monthlyEnd"] as const) {
				for (const lines of Object.values(defaults[cadence])) {
					for (const line of lines) {
						defaultsTemplateLines.add(line.trim());
					}
				}
			}
			if (defaultsTemplateLines.size > 0) {
				for (const tasks of Object.values(appState.cache)) {
					for (const task of tasks) {
						if (defaultsTemplateLines.has(task.raw.trim())) {
							task.fromDefaults = true;
						}
					}
				}
			}
		}
		const headers: Record<string, string[]> = Object.fromEntries(
			rawTexts.map(([name, text]) => [name, text ? extractH1s(text) : []]),
		);
		const notesEntries: Record<string, NotesEntry> = Object.fromEntries(
			rawTexts.map(([name, text]) => {
				const { notes, hasDivider } = text
					? extractNotes(text)
					: { notes: "", hasDivider: false };
				return [name, { text: notes, hadDividerOnLoad: hasDivider }];
			}),
		);
		const backlogText = await readFile(d, "Backlog.md");
		const backlogH1s = backlogText ? extractH1s(backlogText) : [];
		headers["Backlog.md"] = backlogH1s;
		appState.fileHeaders = headers;
		appState.notesCache = notesEntries;
		appState.backlogHeaders = backlogH1s;
		appState.conflicts = await detectConflicts(d);
		// Reset fail counter on successful refresh.
		appState.refreshFailCount = 0;
		appState.lastRefreshError = null;
	} catch (err: any) {
		console.error("[refresh]", err);
		const reason = classifyFolderError(err);
		appState.refreshFailCount++;
		appState.lastRefreshError = reason;

		if (err instanceof FsError && err.reason === "permission") {
			// Permission genuinely revoked — transition to needs-permission.
			if (appState.folder.status === "ready") {
				appState.folder = {
					status: "needs-permission",
					handle: appState.folder.handle,
					name: appState.folder.name,
					errorReason: reason,
				};
			}
			fail(
				"Folder permission was revoked. Click Reconnect to re-grant access.",
			);
		} else if (appState.folder.status === "ready") {
			// Non-permission errors (locked, io, etc.): keep the folder as 'ready'
			// but show an error toast. Do NOT transition to needs-permission —
			// that creates the infinite re-prompt loop on iCloud Drive folders.
			// After 3 consecutive failures, offer recovery actions.
			if (appState.refreshFailCount >= 3) {
				appState.folder = {
					status: "needs-permission",
					handle: appState.folder.handle,
					name: appState.folder.name,
					errorReason: reason,
				};
			}
			const hint =
				reason === "icloud-locked"
					? " If your files are on iCloud Drive, Chrome cannot write to them — move them to a local folder."
					: "";
			fail(`Could not read folder: ${err?.message ?? "unknown error"}.${hint}`);
		} else {
			fail(`Refresh failed: ${err?.message ?? "unknown error"}`);
		}
	} finally {
		appState.loading = false;
	}
}

/**
 * Return tasks for a specific daily file, from cache.
 * Returns [] for missing or unloaded files.
 *
 * @param filename - e.g. "2026-05-12.md"
 */
export function tasksForFile(filename: string): Task[] {
	return appState.cache[filename] ?? [];
}

/**
 * Move a task from one file to another (cross-day drag or roll-forward).
 * Atomic: write target first, then remove from source. Rolls back target
 * if source removal fails.
 *
 * @param task           - The task to move.
 * @param targetFilename - Destination file, e.g. "2026-05-13.md".
 */
export async function moveTask(
	task: Task,
	targetFilename: string,
): Promise<void> {
	const d = dir();
	if (!d || task.file === targetFilename) return;

	// ── 1. Append to target ───────────────────────────────────────────────────
	const targetContent =
		(await readFile(d, targetFilename)) ?? NEW_DAILY_TEMPLATE;
	const taskLine = task.raw;
	const childLines = task.children.map((c) => c.raw);
	const block = [taskLine, ...childLines].join("\n");
	const targetUpdated = appendTask(targetContent, block, task.category);
	await writeFile(d, targetFilename, targetUpdated);

	// ── 2. Remove from source (rollback on failure) ───────────────────────────
	try {
		const sourceContent = await readFile(d, task.file);
		if (sourceContent === null) throw new Error("source gone");
		const sourceLines = sourceContent.split("\n");
		sourceLines.splice(
			task.lineRange[0],
			task.lineRange[1] - task.lineRange[0] + 1,
		);
		// Remove any blank line left behind at the splice point.
		if (
			sourceLines[task.lineRange[0]]?.trim() === "" &&
			(task.lineRange[0] === 0 ||
				sourceLines[task.lineRange[0] - 1]?.trim() === "")
		) {
			sourceLines.splice(task.lineRange[0], 1);
		}
		await writeFile(d, task.file, sourceLines.join("\n"));
	} catch (err) {
		console.error("[moveTask] source removal failed, rolling back", {
			task: task.title,
			targetFilename,
			err,
		});
		// Rollback: remove the line we just added to the target.
		const reread = await readFile(d, targetFilename);
		if (reread) {
			const rb = reread.split("\n");
			rb.splice(rb.length - childLines.length - 1, 1 + childLines.length);
			await writeFile(d, targetFilename, rb.join("\n"));
		}
		fail("Move failed — source could not be updated. Change rolled back.");
		return;
	}

	// ── 3. Update cache for both files ────────────────────────────────────────
	const [newTarget, newSource] = await Promise.all([
		readFile(d, targetFilename),
		readFile(d, task.file),
	]);
	if (newTarget)
		appState.cache[targetFilename] = parseFile(newTarget, targetFilename);
	if (newSource) appState.cache[task.file] = parseFile(newSource, task.file);
	else delete appState.cache[task.file];
}

/**
 * Append a new task to a file and refresh its cache entry.
 *
 * @param filename - Target file, e.g. "2026-05-12.md".
 * @param rawLine  - The markdown line, e.g. "- [ ] **ship invoice** 1h".
 * @param category - H1 section to append under, or null for end of file.
 */
export async function addTask(
	filename: string,
	rawLine: string,
	category: string | null = null,
): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = (await readFile(d, filename)) ?? NEW_DAILY_TEMPLATE;
	const updated = appendTask(current, rawLine, category);
	await writeFile(d, filename, updated);
	appState.cache[filename] = parseFile(updated, filename);
}

/**
 * Add a task to a file, creating the category H1 header if it doesn't exist.
 * Used by the colon-shortcut input: `PP: drawing` ensures `# PP` exists before
 * appending the task line under it.
 *
 * @param filename - Target file, e.g. "2026-05-12.md".
 * @param category - Category name, e.g. "PP".
 * @param taskLine - Built markdown line, e.g. "- [ ] **drawing** 1h".
 */
export async function addTaskWithCategory(
	filename: string,
	category: string,
	taskLine: string,
): Promise<void> {
	const d = dir();
	if (!d) return;
	let current = (await readFile(d, filename)) ?? NEW_DAILY_TEMPLATE;
	if (!extractH1s(current).includes(category)) {
		current = addCategoryHeader(current, category);
	}
	const updated = appendTask(current, taskLine, category);
	await writeFile(d, filename, updated);
	appState.cache[filename] = parseFile(updated, filename);
	appState.fileHeaders[filename] = extractH1s(updated);
	if (filename === "Backlog.md") {
		appState.backlogHeaders = appState.fileHeaders[filename];
	}
}

/**
 * Delete a task (parent + all children) from its file.
 */
export async function deleteTask(task: Task): Promise<void> {
	const d = dir();
	if (!d) return;
	try {
		const current = await readFile(d, task.file);
		if (current === null) return;
		const lines = current.split("\n");
		lines.splice(task.lineRange[0], task.lineRange[1] - task.lineRange[0] + 1);
		const updated = lines.join("\n");
		await writeFile(d, task.file, updated);
		appState.cache[task.file] = parseFile(updated, task.file);
	} catch (err) {
		console.error("[deleteTask]", err);
		fail(
			"Could not delete task — try the Sync button or reconnect the folder.",
		);
	}
}

/**
 * Update the title of a task in-place, preserving starred markers and duration.
 *
 * @param task     - The task whose title to replace.
 * @param newTitle - Plain text; starred wrapping is re-applied from task.starred.
 */
export async function editTaskTitle(
	task: Task,
	newTitle: string,
): Promise<void> {
	const d = dir();
	if (!d) return;
	const trimmed = newTitle.trim();
	if (!trimmed) return;
	const current = await readFile(d, task.file);
	if (current === null) return;
	const lines = current.split("\n");
	const line = lines[task.lineRange[0]];
	const m = line.match(/^(\s*-\s*\[[ xX]\]\s*)(.*)/);
	if (!m) return;
	const prefix = m[1];
	const rest = m[2];
	const durMatch = rest.match(/(\s+\d*\.?\d+\s*(?:h|m))$/i);
	const dur = durMatch ? durMatch[1] : "";
	const titled = task.starred ? `**${trimmed}**` : trimmed;
	lines[task.lineRange[0]] = `${prefix}${titled}${dur}`;
	const updated = lines.join("\n");
	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
}

/**
 * Toggle starred on a task (wraps/unwraps ** around the title in the file).
 */
export async function toggleStar(task: Task): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, task.file);
	if (current === null) return;
	const lines = current.split("\n");
	const line = lines[task.lineRange[0]];
	// Extract the checkbox prefix and the rest of the line.
	const m = line.match(/^(\s*-\s*\[[ xX]\]\s*)(.*)/);
	if (!m) return;
	const prefix = m[1];
	const rest = m[2];
	// rest may end with a duration token — preserve it.
	const durMatch = rest.match(/(\s+\d*\.?\d+\s*(?:h|m))$/i);
	const dur = durMatch ? durMatch[1] : "";
	const titleRaw = durMatch ? rest.slice(0, durMatch.index) : rest;
	const starred =
		titleRaw.trim().startsWith("**") && titleRaw.trim().endsWith("**");
	const newTitle = starred
		? titleRaw.trim().slice(2, -2)
		: `**${titleRaw.trim()}**`;
	lines[task.lineRange[0]] = `${prefix}${newTitle}${dur}`;
	const updated = lines.join("\n");
	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
}

/**
 * Return backlog tasks (from Backlog.md), from cache.
 */
export function backlogTasks(): Task[] {
	return appState.cache["Backlog.md"] ?? [];
}

/**
 * Return all H1 category header names from Backlog.md, including empty ones.
 */
export function backlogCategoryHeaders(): string[] {
	return appState.backlogHeaders;
}

/**
 * Toggle a top-level task's done state and write back to disk.
 * Re-parses only the affected file after writing.
 */
export async function toggleTask(task: Task): Promise<void> {
	const d = dir();
	if (!d) return;
	try {
		const current = await readFile(d, task.file);
		if (current === null) return;
		const updated = toggleTaskDone(current, task);
		await writeFile(d, task.file, updated);
		appState.cache[task.file] = parseFile(updated, task.file);
	} catch (err) {
		console.error("[toggleTask]", err);
		fail(
			"Could not save checkbox — try the Sync button or reconnect the folder.",
		);
	}
}

/**
 * Reorder tasks within a file and write back to disk.
 *
 * @param filename  - File to mutate.
 * @param fromIndex - Current task index.
 * @param toIndex   - Target task index.
 */
export async function reorderFileTasks(
	filename: string,
	fromIndex: number,
	toIndex: number,
): Promise<void> {
	const d = dir();
	if (!d || fromIndex === toIndex) return;
	const current = await readFile(d, filename);
	if (current === null) return;
	const tasks = appState.cache[filename] ?? [];
	const updated = reorderTasks(current, tasks, fromIndex, toIndex);
	await writeFile(d, filename, updated);
	appState.cache[filename] = parseFile(updated, filename);
}

/**
 * Reorder H1 category sections within a file and write back to disk.
 *
 * @param filename  - File to mutate.
 * @param fromIndex - Current category index (among H1 sections in file order).
 * @param toIndex   - Target category index after the move.
 */
export async function reorderFileCategories(
	filename: string,
	fromIndex: number,
	toIndex: number,
): Promise<void> {
	const d = dir();
	if (!d || fromIndex === toIndex) return;
	const current = await readFile(d, filename);
	if (current === null) return;
	const updated = reorderCategories(current, fromIndex, toIndex);
	await writeFile(d, filename, updated);
	appState.cache[filename] = parseFile(updated, filename);
	// Refresh headers derived from the file.
	if (filename === "Backlog.md") {
		appState.backlogHeaders = extractH1s(updated);
	} else {
		appState.fileHeaders[filename] = extractH1s(updated);
	}
}

/**
 * Append a new subtask line after the last child (or parent if no children).
 *
 * @param task  - Parent task to add the subtask under.
 * @param title - Plain text title for the new subtask.
 */
export async function addSubtask(task: Task, title: string): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, task.file);
	if (current === null) return;
	const lines = current.split("\n");
	lines.splice(task.lineRange[1] + 1, 0, `  - [ ] ${title}`);
	const updated = lines.join("\n");
	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
}

/**
 * Update the title of a subtask in-place.
 *
 * @param task     - Parent task (for file reference).
 * @param child    - Subtask to update.
 * @param newTitle - Plain text title (no ** wrapping — subtasks are never starred).
 */
export async function editChildTitle(
	task: Task,
	child: ChildTask,
	newTitle: string,
): Promise<void> {
	const d = dir();
	if (!d) return;
	const trimmed = newTitle.trim();
	if (!trimmed) return;
	const current = await readFile(d, task.file);
	if (current === null) return;
	const lines = current.split("\n");
	const line = lines[child.lineIndex];
	const m = line.match(/^(\s*-\s*\[[ xX]\]\s*)(.*)/);
	if (!m) return;
	lines[child.lineIndex] = `${m[1]}${trimmed}`;
	const updated = lines.join("\n");
	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
}

/**
 * Update the duration estimate on a task line.
 * Removes the duration if newDurMin is null; otherwise formats it as Xh or Xm.
 *
 * @param task      - Task whose duration to update.
 * @param newDurMin - Minutes (0 or null to remove).
 */
export async function editTaskDuration(
	task: Task,
	newDurMin: number | null,
): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, task.file);
	if (current === null) return;
	const lines = current.split("\n");
	const line = lines[task.lineRange[0]];
	const m = line.match(/^(\s*-\s*\[[ xX]\]\s*)(.*)/);
	if (!m) return;
	const prefix = m[1];
	const rest = m[2];
	// Strip any existing duration token from the end.
	const durMatch = rest.match(/(\s+\d*\.?\d+\s*(?:h|m))$/i);
	const body = durMatch ? rest.slice(0, durMatch.index).trimEnd() : rest;
	if (newDurMin && newDurMin > 0) {
		const dur =
			newDurMin % 60 === 0
				? `${newDurMin / 60}h`
				: newDurMin >= 60
					? `${(newDurMin / 60).toFixed(1)}h`
					: `${newDurMin}m`;
		lines[task.lineRange[0]] = `${prefix}${body} ${dur}`;
	} else {
		lines[task.lineRange[0]] = `${prefix}${body}`;
	}
	const updated = lines.join("\n");
	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
}

/**
 * Toggle a subtask's done state and write back to disk.
 */
export async function toggleChild(task: Task, child: ChildTask): Promise<void> {
	const d = dir();
	if (!d) return;
	try {
		const current = await readFile(d, task.file);
		if (current === null) return;
		const updated = toggleChildDone(current, child);
		await writeFile(d, task.file, updated);
		appState.cache[task.file] = parseFile(updated, task.file);
	} catch (err) {
		console.error("[toggleChild]", err);
		fail(
			"Could not save subtask — try the Sync button or reconnect the folder.",
		);
	}
}

/**
 * Return done tasks grouped by date, newest first, for the done log.
 * Limited to files within the last `days` days.
 *
 * @param todayISO - Today's ISO date string.
 * @param days     - How many past days to scan (default 30).
 */
export function doneTasksByDate(
	todayISO: string,
	days = 30,
): { date: string; tasks: Task[] }[] {
	const cutoff = new Date(todayISO + "T12:00:00");
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffISO = cutoff.toISOString().slice(0, 10);

	return Object.entries(appState.cache)
		.filter(([name]) => {
			const m = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
			return m && m[1] >= cutoffISO && m[1] <= todayISO;
		})
		.map(([name, tasks]) => ({
			date: name.replace(".md", ""),
			tasks: tasks.filter((t) => t.done),
		}))
		.filter((g) => g.tasks.length > 0)
		.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Move a task to a different category section within the same file.
 * Removes the task block from its current position and appends it under
 * the target category heading. Does not affect any other tasks.
 *
 * @param task           - The task to move.
 * @param targetCategory - Target H1 section name, or null for no-category.
 */
export async function moveToCategoryInFile(
	task: Task,
	targetCategory: string | null,
): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, task.file);
	if (current === null) return;

	// Remove the task block (parent + children) from the file.
	const lines = current.split("\n");
	lines.splice(task.lineRange[0], task.lineRange[1] - task.lineRange[0] + 1);
	const stripped = lines.join("\n");

	// Append under the new category heading.
	const block = [task.raw, ...task.children.map((c) => c.raw)].join("\n");
	const updated = appendTask(stripped, block, targetCategory);

	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
}

/**
 * Append a new H1 category header to a file and refresh its cache entry.
 *
 * @param filename - Target file, e.g. "Backlog.md" or "2026-05-13.md".
 * @param name     - Category name, e.g. "Work".
 */
export async function addCategoryToFile(
	filename: string,
	name: string,
): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = (await readFile(d, filename)) ?? NEW_DAILY_TEMPLATE;
	const updated = addCategoryHeader(current, name);
	await writeFile(d, filename, updated);
	appState.cache[filename] = parseFile(updated, filename);
	appState.fileHeaders[filename] = extractH1s(updated);
	if (filename === "Backlog.md")
		appState.backlogHeaders = appState.fileHeaders[filename];
}

/**
 * Remove an H1 category header from a file (tasks under it remain).
 *
 * @param filename - Target file.
 * @param name     - Category name to remove.
 */
export async function deleteCategoryFromFile(
	filename: string,
	name: string,
): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, filename);
	if (current === null) return;
	const updated = removeCategoryHeader(current, name);
	await writeFile(d, filename, updated);
	appState.cache[filename] = parseFile(updated, filename);
	appState.fileHeaders[filename] = extractH1s(updated);
	if (filename === "Backlog.md")
		appState.backlogHeaders = appState.fileHeaders[filename];
}

/**
 * Return notes text for a daily file (empty string if none).
 *
 * @param filename - e.g. "2026-05-13.md"
 */
export function notesFor(filename: string): string {
	return appState.notesCache[filename]?.text ?? "";
}

/**
 * Save notes for a daily file, writing the `---` block back to disk.
 *
 * @param filename - e.g. "2026-05-13.md"
 * @param text     - New notes text (empty = clear).
 */
export async function saveNotes(filename: string, text: string): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = (await readFile(d, filename)) ?? "";
	const entry = appState.notesCache[filename] ?? {
		text: "",
		hadDividerOnLoad: false,
	};
	const updated = setNotes(current, text, entry.hadDividerOnLoad);
	await writeFile(d, filename, updated);
	// Update notesCache; hadDividerOnLoad stays fixed for the lifetime of this session.
	appState.notesCache[filename] = {
		text: text.trim(),
		hadDividerOnLoad: entry.hadDividerOnLoad,
	};
	// Also keep the task cache in sync (notes live in the same file).
	appState.cache[filename] = parseFile(updated, filename);
}

/**
 * Complete a backlog task: toggle it to done, remove it from Backlog.md,
 * and append it as a checked item to today's daily file.
 * Writes target first, then removes from source.
 *
 * @param task          - The backlog task to complete.
 * @param todayFilename - Today's daily file, e.g. "2026-07-10.md".
 */
export async function completeBacklogTask(
	task: Task,
	todayFilename: string,
): Promise<void> {
	const d = dir();
	if (!d || task.file !== "Backlog.md") return;

	try {
		const backlogContent = await readFile(d, "Backlog.md");
		if (!backlogContent) return;

		const lines = backlogContent.split("\n");

		// Toggle the parent line to [x] in the local copy.
		lines[task.lineRange[0]] = lines[task.lineRange[0]].replace(
			/\[\s\]/,
			"[x]",
		);

		// Build the checked block (parent + children).
		const childLines = task.children.map((c) => c.raw);
		const checkedBlock = [lines[task.lineRange[0]], ...childLines].join("\n");

		// 1. Append checked block to today's file.
		const todayContent =
			(await readFile(d, todayFilename)) ?? NEW_DAILY_TEMPLATE;
		const todayUpdated = appendTask(todayContent, checkedBlock, task.category);
		await writeFile(d, todayFilename, todayUpdated);

		// 2. Remove the task block from Backlog.md.
		lines.splice(task.lineRange[0], task.lineRange[1] - task.lineRange[0] + 1);
		await writeFile(d, "Backlog.md", lines.join("\n"));

		// 3. Refresh both caches.
		const [newToday, newBacklog] = await Promise.all([
			readFile(d, todayFilename),
			readFile(d, "Backlog.md"),
		]);
		if (newToday)
			appState.cache[todayFilename] = parseFile(newToday, todayFilename);
		if (newBacklog)
			appState.cache["Backlog.md"] = parseFile(newBacklog, "Backlog.md");
	} catch (err) {
		console.error("[completeBacklogTask]", err);
		fail(
			"Could not complete backlog task — try the Sync button or reconnect the folder.",
		);
	}
}

/**
 * Return all unchecked tasks from past-dated files (overdue items).
 * Default-inserted tasks are excluded — they belong to their scheduled
 * period, not the past.
 *
 * @param todayISO - Today's date as "YYYY-MM-DD".
 */
export function overdueTasks(todayISO: string): Task[] {
	return Object.entries(appState.cache)
		.filter(([name]) => {
			const m = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
			return m && m[1] < todayISO;
		})
		.flatMap(([, tasks]) => tasks.filter((t) => !t.done && !t.fromDefaults));
}

/**
 * Fully reset the folder connection: clear the stored handle from IndexedDB,
 * wipe the in-memory cache and all refresh error state, and return to the
 * initial 'none' folder state. Use when the folder handle is irrecoverably
 * broken (stale PWA handle, iCloud Drive incompatibility).
 */
export async function forgetAndResetFolder(): Promise<void> {
	await clearHandle();
	appState.folder = { status: "none" };
	appState.cache = {};
	appState.fileHeaders = {};
	appState.notesCache = {};
	appState.backlogHeaders = [];
	appState.conflicts = [];
	appState.refreshFailCount = 0;
	appState.lastRefreshError = null;
	appState.lastError = null;
	appState.defaultsApplied = new Set();
}
