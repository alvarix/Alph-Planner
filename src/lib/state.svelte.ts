/**
 * In-memory cache of parsed daily files.
 * Source of truth is always the disk. This cache is rebuilt on every
 * window focus and after every write.
 */

import { parseFile, relocateTask, relocateChild } from "./md/parse.js";
import {
	toggleTaskDone,
	toggleChildDone,
	reorderTasks,
	reorderCategories,
	appendTask,
	insertUnderWeekMarker,
	addCategoryHeader,
	removeCategoryHeader,
	setTaskLineStatus,
	setTaskDone,
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
import { getWeekDays } from "./dates.js";
import { clearHandle } from "./fs/handle-store.js";
import { SvelteMap } from "svelte/reactivity";
import * as E from "./errors.js";
import {
	diagnoseAccessFailure,
	logDiagnosticReport,
} from "./fs/diagnostics.js";
import type { Task, ChildTask, TaskStatus, ChangeEntry, AppError } from "./types.js";
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
	lastError: AppError | null;
	/** Period keys already inserted this session — prevents multi-file insertion. */
	defaultsApplied: Set<string>;
	/** Consecutive refresh failures. Reset on successful refresh. */
	refreshFailCount: number;
	/** Reason for the last failed refresh (null when last refresh succeeded). */
	lastRefreshError: import("./fs/folder.js").FolderErrorReason | null;
	/** Pending delayed completions keyed by "file:lineIndex". */
	pendingCompletions: Map<string, PendingCompletion>;
	/** In-memory change log for the git-tree history panel. Capped at 200. */
	changeLog: ChangeEntry[];
}

interface PendingCompletion {
	task: Task;
	previousStatus: TaskStatus;
	timer: ReturnType<typeof setTimeout>;
}

/** Template written when the app creates a new daily file from scratch. */
const NEW_DAILY_TEMPLATE = "![[Backlog]]\n\n";

/**
 * Monday (ISO) of the current real week. Backlog additions without an
 * explicit category are grouped under a `## Added week of` heading for this
 * week, so manually added tasks stay with the tasks rolled from the same week.
 */
function currentWeekMonday(): string {
	return getWeekDays(0)[0].iso;
}

/**
 * Get content for a daily file, falling back to template with defaults
 * applied when the file doesn't exist yet. Non-date files (e.g. Backlog.md)
 * receive the plain template without defaults injection.
 */
async function getOrCreateDayContent(
	d: FileSystemDirectoryHandle,
	filename: string,
): Promise<string> {
	const existing = await readFile(d, filename);
	if (existing !== null) return existing;
	const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
	if (!dateMatch) return NEW_DAILY_TEMPLATE;
	const defaultsText = await readDefaultsFile(d);
	if (!defaultsText) return NEW_DAILY_TEMPLATE;
	const defaults = parseDefaults(defaultsText);
	return applyDefaults(NEW_DAILY_TEMPLATE, defaults, dateMatch[1], appState.defaultsApplied);
}

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
	pendingCompletions: new SvelteMap(),
	changeLog: [],
});

/** Extract all # H1 section names from raw file text. */
export function extractH1s(content: string): string[] {
	return content
		.split("\n")
		.map((l) => l.match(/^#\s+(.+)/)?.[1]?.trim())
		.filter((h): h is string => !!h);
}

function fail(err: AppError) {
	appState.lastError = err;
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

		// ── Create missing day files for the visible week ─────────────────
		// Navigation to a future week should show defaults immediately, not
		// just empty columns. For any visible day that has no file on disk,
		// create it from the template with defaults applied.
		const weekDays = getWeekDays(appState.weekOffset);
		for (const day of weekDays) {
			const name = `${day.iso}.md`;
			if (!appState.cache[name]) {
				const content = await getOrCreateDayContent(d, name);
				// Only persist if defaults were applied (content differs from bare template).
				if (content !== NEW_DAILY_TEMPLATE) {
					try {
						await writeFile(d, name, content);
					} catch (err) {
						console.warn("[refresh:createMissing] write failed", { name, err });
					}
				}
				appState.cache[name] = parseFile(content, name);
				appState.fileHeaders[name] = extractH1s(content);
				// Notes cache: extract notes if present in the template.
				const { notes } = extractNotes(content);
				appState.notesCache[name] = { text: notes, hadDividerOnLoad: false };
			}
		}

		// Reset fail counter on successful refresh.
		appState.refreshFailCount = 0;
		appState.lastRefreshError = null;
	} catch (err: any) {
		console.error("[refresh]", err);
		const reason = classifyFolderError(err);
		appState.refreshFailCount++;
		appState.lastRefreshError = reason;

		// ── Diagnostic probe: isolate the root cause ──────────────────
		if (reason === "icloud-locked" && appState.folder.status === "ready") {
			diagnoseAccessFailure(appState.folder.handle, err).then(
				logDiagnosticReport,
			);
		}

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
			fail(E.permissionRevoked);
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
					? ' If this started after a deploy, a stale service worker cache is likely the cause — try "Clear cache & reload" in the folder picker.'
					: "";
			fail(E.folderInaccessible(`Could not read folder: ${err?.message ?? "unknown error"}.${hint}`));
		} else {
			fail(E.refreshFailed(err?.message ?? "unknown error"));
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
 * Destination placement: when a weekMarker is supplied (week rollover) the
 * task is appended under the `## Added week of` heading regardless of its
 * category. Otherwise, tasks moving into Backlog.md without a category are
 * grouped under the current week's heading; all other moves keep the task's
 * category section placement via appendTask.
 *
 * @param task           - The task to move.
 * @param targetFilename - Destination file, e.g. "2026-05-13.md".
 * @param opts           - Optional weekMarker (Monday ISO) for rollover moves.
 */
export async function moveTask(
	task: Task,
	targetFilename: string,
	opts?: { weekMarker?: string },
): Promise<void> {
	const d = dir();
	if (!d || task.file === targetFilename) return;

	// ── 1. Append to target ───────────────────────────────────────────────────
	const targetContent = await getOrCreateDayContent(d, targetFilename);
	const taskLine = task.raw;
	const childLines = task.children.map((c) => c.raw);
	const block = [taskLine, ...childLines].join("\n");
	const targetUpdated = opts?.weekMarker
		? insertUnderWeekMarker(targetContent, block, opts.weekMarker)
		: targetFilename === "Backlog.md" && !task.category
			? insertUnderWeekMarker(targetContent, block, currentWeekMonday())
			: appendTask(targetContent, block, task.category);
	await writeFile(d, targetFilename, targetUpdated);

	// ── 2. Remove from source (rollback on failure) ───────────────────────────
	try {
		const sourceContent = await readFile(d, task.file);
		if (sourceContent === null) throw new Error("source gone");
		const fresh = relocateTask(sourceContent, task);
		if (!fresh) throw new Error("task not found in source (file changed)");
		const sourceLines = sourceContent.split("\n");
		const start = fresh.lineRange[0];
		const len = fresh.lineRange[1] - fresh.lineRange[0] + 1;
		sourceLines.splice(start, len);
		// Remove any blank line left behind at the splice point.
		if (
			sourceLines[start]?.trim() === "" &&
			(start === 0 || sourceLines[start - 1]?.trim() === "")
		) {
			sourceLines.splice(start, 1);
		}
		await writeFile(d, task.file, sourceLines.join("\n"));
	} catch (err) {
		console.error("[moveTask] source removal failed, rolling back", {
			task: task.title,
			targetFilename,
			err,
		});
		// Rollback: remove the EXACT block we just inserted. The previous
		// implementation chopped the last N lines of the target, which
		// destroys real tasks when the block was inserted mid-file (Bug 03).
		// Locating the block by its exact content is correct regardless of
		// where appendTask/insertUnderWeekMarker placed it.
		const reread = await readFile(d, targetFilename);
		if (reread) {
			const rb = reread.split("\n");
			const blockLines = block.split("\n");
			let foundAt = -1;
			for (
				let i = 0;
				i + blockLines.length <= rb.length;
				i++
			) {
				if (blockLines.every((bl, k) => rb[i + k] === bl)) {
					foundAt = i;
					break;
				}
			}
			if (foundAt !== -1) {
				rb.splice(foundAt, blockLines.length);
				await writeFile(d, targetFilename, rb.join("\n"));
			}
		}
		await refresh();
		fail(E.moveRolledBack);
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
	recordChange('→', 'Moved', targetFilename, `${task.title} ← ${task.file}`);
}

/**
 * Move every unfinished (todo or in-progress) task from a fully-past week
 * into Backlog.md, grouped under a visible `## Added week of YYYY-MM-DD`
 * heading. Done tasks stay in their original daily files. Blocks keep their
 * raw lines, children, and checkbox state verbatim.
 *
 * The batch is written target-first (Backlog.md), then each source file;
 * if any source write fails, Backlog.md is restored from its original text
 * and no task is reported as moved. Safe to run repeatedly — an already-
 * rolled week contains no unfinished tasks, so a second run is a no-op.
 *
 * @param weekOffset - Week offset from the current week; must be negative
 *                     (only fully-past weeks are eligible).
 * @returns The number of tasks rolled.
 */
export async function rollWeekToBacklog(weekOffset: number): Promise<number> {
	const d = dir();
	if (!d) return 0;
	const days = getWeekDays(weekOffset);
	if (!days.every((day) => day.past)) {
		fail(E.invalidAction("Only fully-past weeks can be rolled to the backlog."));
		return 0;
	}

	// Collect unfinished tasks per day file, in chronological order.
	const mondayISO = days[0].iso;
	const perDay: { filename: string; tasks: Task[] }[] = [];
	let total = 0;
	for (const day of days) {
		const filename = `${day.iso}.md`;
		const tasks = (appState.cache[filename] ?? []).filter(
			(t) => t.status !== "done",
		);
		if (tasks.length === 0) continue;
		perDay.push({ filename, tasks });
		total += tasks.length;
	}
	if (total === 0) return 0;

	// Read every affected file once.
	const backlogOriginal = (await readFile(d, "Backlog.md")) ?? "";
	const sourceTexts = new Map<string, string>();
	for (const { filename } of perDay) {
		const text = await readFile(d, filename);
		if (text !== null) sourceTexts.set(filename, text);
	}

	// Build the new Backlog.md: insert each block under the week heading,
	// preserving file order (Mon → Sun, top-to-bottom within each day).
	let newBacklog = backlogOriginal;
	const moved: { task: Task; filename: string }[] = [];
	for (const { filename, tasks } of perDay) {
		for (const task of tasks) {
			const block = [task.raw, ...task.children.map((c) => c.raw)].join("\n");
			newBacklog = insertUnderWeekMarker(newBacklog, block, mondayISO);
			moved.push({ task, filename });
		}
	}

	// Build new source contents by removing each task block. Each task is
	// re-located against the freshly-read (and evolving) source text before
	// splicing, so a stale cached lineRange never removes the wrong block
	// (Bug 03). Blocks are removed bottom-up as a fast path; relocateTask is
	// authoritative if the cache drifted.
	const newSources = new Map<string, string>();
	for (const { filename, tasks } of perDay) {
		const text = sourceTexts.get(filename);
		if (text === undefined) continue;
		const sorted = [...tasks].sort((a, b) => b.lineRange[0] - a.lineRange[0]);
		let content = text;
		for (const task of sorted) {
			const fresh = relocateTask(content, task);
			if (!fresh) {
				// Task no longer present in this source file — skip it. Its block
				// is already absent, so there is nothing to remove.
				continue;
			}
			const lines = content.split("\n");
			const start = fresh.lineRange[0];
			lines.splice(start, fresh.lineRange[1] - fresh.lineRange[0] + 1);
			// Collapse the blank line left behind at the splice point.
			if (
				lines[start]?.trim() === "" &&
				(start === 0 || lines[start - 1]?.trim() === "")
			) {
				lines.splice(start, 1);
			}
			content = lines.join("\n");
		}
		newSources.set(filename, content);
	}

	// Write target first, then sources; restore the target on any failure.
	try {
		await writeFile(d, "Backlog.md", newBacklog);
		for (const [filename, content] of newSources) {
			await writeFile(d, filename, content);
		}
	} catch (err) {
		console.error("[rollWeekToBacklog] write failed, rolling back", err);
		try {
			await writeFile(d, "Backlog.md", backlogOriginal);
		} catch {
			// Target restore failed — unrecoverable, the error is surfaced below.
		}
		await refresh();
		fail(E.rollFailed);
		return 0;
	}

	// Refresh caches and log each move.
	appState.cache["Backlog.md"] = parseFile(newBacklog, "Backlog.md");
	for (const [filename, content] of newSources) {
		appState.cache[filename] = parseFile(content, filename);
	}
	for (const { task, filename } of moved) {
		recordChange('→', 'Rolled', 'Backlog.md', `${task.title} ← ${filename}`);
	}
	return moved.length;
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
	const current = await getOrCreateDayContent(d, filename);
	// Manual backlog additions without a category join the current week's
	// "## Added week of" section so they stay with tasks rolled from that
	// week. Categorized adds keep their explicit section placement.
	const updated =
		filename === "Backlog.md" && !category
			? insertUnderWeekMarker(current, rawLine, currentWeekMonday())
			: appendTask(current, rawLine, category);
	await writeFile(d, filename, updated);
	appState.cache[filename] = parseFile(updated, filename);
	// Extract title from the raw line for the change log.
	const tMatch = rawLine.match(/^\s*-\s*\[[ xX>-]\]\s*(?:\*\*)?(.+?)(?:\*\*)?(?:\s+\d)/);
	const tTitle = tMatch ? tMatch[1].trim() : rawLine.trim();
	recordChange('+', 'Added', filename, tTitle);
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
	let current = await getOrCreateDayContent(d, filename);
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
	const ctMatch = taskLine.match(/^\s*-\s*\[[ xX>-]\]\s*(?:\*\*)?(.+?)(?:\*\*)?(?:\s+\d)/);
	const ctTitle = ctMatch ? ctMatch[1].trim() : taskLine.trim();
	recordChange('+', 'Added', filename, ctTitle);
}

/**
 * Duplicate a task, inserting the copy immediately after the original.
 * The new task is always unchecked ([ ]) regardless of the original's
 * checkbox state. Children, star, and duration are preserved.
 *
 * @param task - The task to duplicate (parent + children).
 */
export async function duplicateTask(task: Task): Promise<void> {
	const d = dir();
	if (!d) return;
	try {
		const current = await readFile(d, task.file);
		if (current === null) return;
		const fresh = relocateTask(current, task);
		if (!fresh) {
			fail(E.fileChanged("click"));
			await refresh();
			return;
		}
		const lines = current.split("\n");

		// Build the duplicated block with all checkboxes reset to [ ].
		const dupParent = fresh.raw.replace(/\[.\]/i, "[ ]");
		const dupChildren = fresh.children.map((c) =>
			c.raw.replace(/\[.\]/i, "[ ]"),
		);
		const block = [dupParent, ...dupChildren];

		// Insert after the original task block.
		lines.splice(fresh.lineRange[1] + 1, 0, ...block);
		const updated = lines.join("\n");
		await writeFile(d, task.file, updated);
		appState.cache[task.file] = parseFile(updated, task.file);
		recordChange('+', 'Duplicated', task.file, task.title);
	} catch (err) {
		console.error("[duplicateTask]", err);
		await refresh();
		fail(E.writeFailed("duplicate task"));
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
		const fresh = relocateTask(current, task);
		if (!fresh) {
			console.warn("[deleteTask] task not found — file changed", {
				title: task.title,
				raw: task.raw,
			});
			fail(E.fileChanged("click"));
			await refresh();
			return;
		}
		const lines = current.split("\n");
		lines.splice(fresh.lineRange[0], fresh.lineRange[1] - fresh.lineRange[0] + 1);
		const updated = lines.join("\n");
		await writeFile(d, task.file, updated);
		appState.cache[task.file] = parseFile(updated, task.file);
		recordChange('−', 'Deleted', task.file, task.title);
	} catch (err) {
		console.error("[deleteTask]", err);
		await refresh();
		fail(E.writeFailed("delete task"));
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
	const fresh = relocateTask(current, task);
	if (!fresh) {
		fail(E.fileChanged("edit"));
		await refresh();
		return;
	}
	const lines = current.split("\n");
	const line = lines[fresh.lineRange[0]];
	const m = line.match(/^(\s*-\s*\[[ xX>-]\]\s*)(.*)/);
	if (!m) return;
	const prefix = m[1];
	const rest = m[2];
	const durMatch = rest.match(/(\s+\d*\.?\d+\s*(?:h|m))$/i);
	const dur = durMatch ? durMatch[1] : "";
	const titled = task.starred ? `**${trimmed}**` : trimmed;
	lines[fresh.lineRange[0]] = `${prefix}${titled}${dur}`;
	const updated = lines.join("\n");
	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
	if (task.title !== trimmed) {
		recordChange('✎', 'Renamed', task.file, `${task.title} → ${trimmed}`);
	}
}

/**
 * Toggle starred on a task (wraps/unwraps ** around the title in the file).
 */
export async function toggleStar(task: Task): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, task.file);
	if (current === null) return;
	const fresh = relocateTask(current, task);
	if (!fresh) {
		fail(E.fileChanged("click"));
		await refresh();
		return;
	}
	const lines = current.split("\n");
	const line = lines[fresh.lineRange[0]];
	// Extract the checkbox prefix and the rest of the line.
	const m = line.match(/^(\s*-\s*\[[ xX>-]\]\s*)(.*)/);
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
	lines[fresh.lineRange[0]] = `${prefix}${newTitle}${dur}`;
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
	const key = `${task.file}:${task.lineRange[0]}`;

	// If there's a pending completion, the task was optimistically marked done.
	// Cancel the timer and force-write todo ([ ]) — the disk still has
	// in-progress ([>]) because the timer hasn't flushed yet, so cycling
	// would go back to [x].
	if (appState.pendingCompletions.has(key)) {
		const entry = appState.pendingCompletions.get(key)!;
		clearTimeout(entry.timer);
		appState.pendingCompletions.delete(key);

		const d = dir();
		if (!d) return;
		try {
			const current = await readFile(d, task.file);
			if (current === null) return;
			const fresh = relocateTask(current, task);
			if (!fresh) {
				fail(E.fileChanged("click"));
				await refresh();
				return;
			}
			const updated = setTaskDone(current, fresh, "todo");
			await writeFile(d, task.file, updated);
			appState.cache[task.file] = parseFile(updated, task.file);
		} catch (err) {
			console.error("[toggleTask/undo]", err);
			await refresh();
			fail(E.writeFailed("save checkbox"));
		}
		return;
	}

	// Check if this toggle will transition to "done" (from in-progress).
	const willBeDone = task.status === "in-progress";

	if (willBeDone) {
		const d = dir();
		if (!d) return;

		// Optimistic cache update — show done immediately.
		const cache = appState.cache[task.file];
		if (cache) {
			const idx = cache.findIndex((t) => t.lineRange[0] === task.lineRange[0]);
			if (idx !== -1) {
				cache[idx] = { ...cache[idx], status: "done" as TaskStatus };
			}
		}

		// Schedule the actual write 3 seconds later.
		const timer = setTimeout(() => {
			flushCompletion(task, key);
		}, 3_000);

		appState.pendingCompletions.set(key, {
			task,
			previousStatus: task.status,
			timer,
		});
		return;
	}

	// Immediate write for non-done transitions.
	const d = dir();
	if (!d) return;
	try {
		const current = await readFile(d, task.file);
		if (current === null) return;
		const fresh = relocateTask(current, task);
		if (!fresh) {
			fail(E.fileChanged("click"));
			await refresh();
			return;
		}
		const updated = toggleTaskDone(current, fresh);
		await writeFile(d, task.file, updated);
		appState.cache[task.file] = parseFile(updated, task.file);
		const newStatus: TaskStatus = task.status === 'todo' ? 'in-progress' : 'todo';
		recordChange(newStatus === 'todo' ? '○' : '−', newStatus === 'todo' ? 'Reopened' : 'Started', task.file, task.title);
	} catch (err) {
		console.error("[toggleTask]", err);
		await refresh();
		fail(E.writeFailed("save checkbox"));
	}
}

/**
 * Complete a task immediately, skipping the tri-state cycle.
 * Used by long-press gesture. Always sets status to "done" with a 3-second
 * undo window, regardless of current status.
 *
 * If the task is already done or has a pending completion, this acts as undo.
 *
 * @param task - The task to complete.
 */
export async function completeTask(task: Task): Promise<void> {
	const key = `${task.file}:${task.lineRange[0]}`;

	// If already pending completion, clicking again cancels it.
	if (appState.pendingCompletions.has(key)) {
		cancelCompletion(task);
		return;
	}

	// If already done, toggle back to todo immediately.
	if (task.status === "done") {
		const d = dir();
		if (!d) return;
		try {
			const current = await readFile(d, task.file);
			if (current === null) return;
			const fresh = relocateTask(current, task);
			if (!fresh) {
				fail(E.fileChanged("click"));
				await refresh();
				return;
			}
			const updated = toggleTaskDone(current, fresh);
			await writeFile(d, task.file, updated);
			appState.cache[task.file] = parseFile(updated, task.file);
		} catch (err) {
			console.error("[completeTask/undo]", err);
			await refresh();
			fail(E.writeFailed("undo"));
		}
		return;
	}

	const previousStatus = task.status;

	// Optimistic cache update — show done immediately.
	const cache = appState.cache[task.file];
	if (cache) {
		const idx = cache.findIndex((t) => t.lineRange[0] === task.lineRange[0]);
		if (idx !== -1) {
			cache[idx] = { ...cache[idx], status: "done" as TaskStatus };
		}
	}

	// Schedule the actual write 3 seconds later.
	const timer = setTimeout(() => {
		flushCompletion(task, key);
	}, 3_000);

	appState.pendingCompletions.set(key, {
		task,
		previousStatus,
		timer,
	});
}

/**
 * Cancel a pending delayed completion and revert the task to its
 * previous status in the cache.
 *
 * @param task - The task whose pending completion should be cancelled.
 */
export function cancelCompletion(task: Task): void {
	const key = `${task.file}:${task.lineRange[0]}`;
	const entry = appState.pendingCompletions.get(key);
	if (!entry) return;

	clearTimeout(entry.timer);
	appState.pendingCompletions.delete(key);

	// Revert the cache to the previous status.
	const cache = appState.cache[task.file];
	if (cache) {
		const idx = cache.findIndex((t) => t.lineRange[0] === task.lineRange[0]);
		if (idx !== -1) {
			cache[idx] = { ...cache[idx], status: entry.previousStatus };
		}
	}
}

/**
 * Internal: flush a delayed completion to disk.
 * Called when the 3-second timer fires.
 */
async function flushCompletion(task: Task, key: string): Promise<void> {
	appState.pendingCompletions.delete(key);

	const d = dir();
	if (!d) return;

	try {
		const current = await readFile(d, task.file);
		if (current === null) return;
		const fresh = relocateTask(current, task);
		if (!fresh) {
			// Task line changed or vanished since the optimistic update — revert
			// the cache so the UI doesn't claim done, then re-sync.
			const cache = appState.cache[task.file];
			if (cache) {
				const idx = cache.findIndex((t) => t.lineRange[0] === task.lineRange[0]);
				if (idx !== -1) {
					cache[idx] = { ...cache[idx], status: task.status };
				}
			}
			fail(E.fileChanged("click"));
			await refresh();
			return;
		}
		// Force the line to [x] regardless of current state.
		const updated = setTaskDone(current, fresh, "done");
		await writeFile(d, task.file, updated);
		appState.cache[task.file] = parseFile(updated, task.file);
		recordChange('✓', 'Completed', task.file, task.title);
	} catch (err) {
		console.error("[flushCompletion]", err);
		// Revert the cache so the UI doesn't lie.
		const cache = appState.cache[task.file];
		if (cache) {
			const idx = cache.findIndex((t) => t.lineRange[0] === task.lineRange[0]);
			if (idx !== -1) {
				cache[idx] = { ...cache[idx], status: task.status };
			}
		}
		await refresh();
		fail(E.writeFailed("save completion"));
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
	const fresh = relocateTask(current, task);
	if (!fresh) {
		fail(E.fileChanged("click"));
		await refresh();
		return;
	}
	const lines = current.split("\n");
	lines.splice(fresh.lineRange[1] + 1, 0, `  - [ ] ${title}`);
	const updated = lines.join("\n");
	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
	recordChange('+', 'Added subtask', task.file, `${task.title} › ${title}`);
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
	const fresh = relocateChild(current, task, child);
	if (!fresh) {
		fail(E.fileChanged("edit"));
		await refresh();
		return;
	}
	const lines = current.split("\n");
	const line = lines[fresh.lineIndex];
	const m = line.match(/^(\s*-\s*\[[ xX>-]\]\s*)(.*)/);
	if (!m) return;
	lines[fresh.lineIndex] = `${m[1]}${trimmed}`;
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
	const fresh = relocateTask(current, task);
	if (!fresh) {
		fail(E.fileChanged("edit"));
		await refresh();
		return;
	}
	const lines = current.split("\n");
	const line = lines[fresh.lineRange[0]];
	const m = line.match(/^(\s*-\s*\[[ xX>-]\]\s*)(.*)/);
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
		lines[fresh.lineRange[0]] = `${prefix}${body} ${dur}`;
	} else {
		lines[fresh.lineRange[0]] = `${prefix}${body}`;
	}
	const updated = lines.join("\n");
	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
}

/**
 * Toggle a subtask's done state and write back to disk.
 *
 * When the parent task has children, toggling any child also propagates
 * status upward:
 *  - Any non-todo child → parent moves to in-progress.
 *  - All children done → parent moves to done.
 *  - All children back to todo → parent moves to todo.
 *
 * For backlog tasks, a parent that becomes done through this cascade is
 * automatically completed (moved to today's file as [x]).
 *
 * @param task          - Parent task.
 * @param child         - Subtask being toggled.
 * @param todayFilename - Today's daily file (only needed for backlog auto-complete).
 */
export async function toggleChild(
	task: Task,
	child: ChildTask,
	todayFilename?: string,
): Promise<void> {
	const d = dir();
	if (!d) return;
	try {
		const current = await readFile(d, task.file);
		if (current === null) return;

		// 0. Re-locate the child against the freshly-read file so the
		// toggle never targets a stale lineIndex (Bug 03).
		const freshChild = relocateChild(current, task, child);
		if (!freshChild) {
			fail(E.fileChanged("click"));
			await refresh();
			return;
		}

		// 1. Toggle the child line.
		let updated = toggleChildDone(current, freshChild);

		// 2. Re-parse to get fresh children states. Locate the parent by its
		// raw line (the child toggle does not change the parent line), not by
		// the cached lineRange, which may be stale (Bug 03).
		const freshTasks = parseFile(updated, task.file);
		const freshTask = freshTasks.find((t) => t.raw === task.raw);

		if (freshTask && freshTask.children.length > 0) {
			const doneCount = freshTask.children.filter(
				(c) => c.status === "done",
			).length;
			const hasActive = freshTask.children.some(
				(c) => c.status === "done" || c.status === "in-progress",
			);

			// 3. Determine parent's correct status.
			let targetStatus: TaskStatus;
			if (doneCount === freshTask.children.length) {
				targetStatus = "done";
			} else if (hasActive) {
				targetStatus = "in-progress";
			} else {
				targetStatus = "todo";
			}

			// 4. If parent status needs to change, apply it.
			if (targetStatus !== freshTask.status) {
				if (
					targetStatus === "done" &&
					task.file === "Backlog.md" &&
					todayFilename
				) {
						// Backlog task with all children done: auto-complete to today.
					const lines = updated.split("\n");
					const pStart = freshTask.lineRange[0];
					const pEnd = freshTask.lineRange[1];

					// Mark parent line as [x].
					lines[pStart] = setTaskLineStatus(
						lines[pStart],
						"done",
					);

					// Build the checked block for insertion into today's file.
					const childLines = freshTask.children.map((c) => c.raw);
					const checkedBlock = [lines[pStart], ...childLines].join(
						"\n",
					);

					// Remove block from backlog copy.
					lines.splice(pStart, pEnd - pStart + 1);

					// Append to today's file.
					const todayContent = await getOrCreateDayContent(d, todayFilename);
					const todayUpdated = appendTask(
						todayContent,
						checkedBlock,
						freshTask.category,
					);
					await writeFile(d, todayFilename, todayUpdated);

					// Write the pruned backlog.
					await writeFile(d, "Backlog.md", lines.join("\n"));

					// Refresh both caches.
					const [newToday, newBacklog] = await Promise.all([
						readFile(d, todayFilename),
						readFile(d, "Backlog.md"),
					]);
					if (newToday)
						appState.cache[todayFilename] = parseFile(newToday, todayFilename);
					if (newBacklog)
						appState.cache["Backlog.md"] = parseFile(newBacklog, "Backlog.md");
					recordChange('✓', 'Completed', todayFilename, `${task.title} (all subtasks done)`);
				} else {
					// Same-file parent status update — use the fresh lineRange.
					const lines = updated.split("\n");
					lines[freshTask.lineRange[0]] = setTaskLineStatus(
						lines[freshTask.lineRange[0]],
						targetStatus,
					);
					updated = lines.join("\n");
					await writeFile(d, task.file, updated);
					appState.cache[task.file] = parseFile(updated, task.file);
					recordChange(
						targetStatus === 'done' ? '✓' : targetStatus === 'in-progress' ? '−' : '○',
						targetStatus === 'done' ? 'Completed' : targetStatus === 'in-progress' ? 'Started' : 'Reopened',
						task.file,
						`${task.title} (via subtasks)`,
					);
				}
				// Parent was updated — cache is already refreshed in the
				// branches above; return to avoid the double-parse below.
				return;
			}
		}

		// No parent update needed — write the child-only toggle.
		await writeFile(d, task.file, updated);
		appState.cache[task.file] = parseFile(updated, task.file);
		recordChange(
			child.status === 'done' ? '○' : child.status === 'in-progress' ? '✓' : '−',
			child.status === 'done' ? 'Reopened subtask' : child.status === 'in-progress' ? 'Completed subtask' : 'Started subtask',
			task.file,
			`${task.title} › ${child.title}`,
		);
	} catch (err) {
		console.error("[toggleChild]", err);
		await refresh();
		fail(E.writeFailed("save subtask"));
	}
}

/** Maximum entries in the in-memory change log before oldest are pruned. */
const CHANGE_LOG_CAP = 200;

/**
 * Record a mutation in the change log for the git-tree history panel.
 * Automatically prunes oldest entries when the cap is exceeded.
 *
 * @param icon   - Single-character symbol (e.g. "✓", "+", "−", "→", "✎").
 * @param action - Past-tense verb (e.g. "Completed", "Added").
 * @param file   - Filename affected.
 * @param detail - Human-readable detail (usually the task title).
 */
export function recordChange(
	icon: string,
	action: string,
	file: string,
	detail: string,
): void {
	appState.changeLog.unshift({
		timestamp: new Date(),
		icon,
		action,
		file,
		detail,
	});
	if (appState.changeLog.length > CHANGE_LOG_CAP) {
		appState.changeLog.length = CHANGE_LOG_CAP;
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
			tasks: tasks.filter((t) => t.status === "done"),
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

	const fresh = relocateTask(current, task);
	if (!fresh) {
		console.warn("[moveToCategoryInFile] task not found — file changed", {
			title: task.title,
			raw: task.raw,
		});
		fail(E.fileChanged("click"));
		await refresh();
		return;
	}

	// Remove the task block (parent + children) from the file.
	const lines = current.split("\n");
	lines.splice(fresh.lineRange[0], fresh.lineRange[1] - fresh.lineRange[0] + 1);
	const stripped = lines.join("\n");

	// Append under the new category heading, using the fresh block.
	const block = [fresh.raw, ...fresh.children.map((c) => c.raw)].join("\n");
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
	const current = await getOrCreateDayContent(d, filename);
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

		// Re-locate the task against the freshly-read file. The cached
		// lineRange may be stale (a week heading or another task shifted line
		// numbers between render and this click); splicing a stale index is the
		// vanishing-tasks bug, so abort to a recoverable sync conflict instead.
		const fresh = relocateTask(backlogContent, task);
		if (!fresh) {
			console.warn("[completeBacklogTask] task not found in backlog — file changed", {
				title: task.title,
				raw: task.raw,
			});
			fail(E.fileChanged("click"));
			await refresh();
			return;
		}

		const lines = backlogContent.split("\n");

		// Toggle the parent line to [x] (done) in the local copy.
		// Handles any current state: [ ], [-], [>], [x].
		lines[fresh.lineRange[0]] = lines[fresh.lineRange[0]].replace(
			/\[[ xX>-]\]/, "[x]",
		);

		// Build the checked block (parent + children) from the FRESH children.
		const childLines = fresh.children.map((c) => c.raw);
		const checkedBlock = [lines[fresh.lineRange[0]], ...childLines].join("\n");

		// 1. Append checked block to today's file.
		const todayContent = await getOrCreateDayContent(d, todayFilename);
		const todayUpdated = appendTask(todayContent, checkedBlock, fresh.category);
		await writeFile(d, todayFilename, todayUpdated);

		// 2. Remove the task block from Backlog.md.
		lines.splice(fresh.lineRange[0], fresh.lineRange[1] - fresh.lineRange[0] + 1);
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
		recordChange('✓', 'Completed', todayFilename, `${task.title} ← Backlog`);
	} catch (err) {
		console.error("[completeBacklogTask]", err);
		await refresh();
		fail(E.writeFailed("complete backlog task"));
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
		.flatMap(([, tasks]) =>
			tasks.filter((t) => t.status !== "done" && !t.fromDefaults),
		);
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
