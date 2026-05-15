/**
 * In-memory cache of parsed daily files.
 * Source of truth is always the disk. This cache is rebuilt on every
 * window focus and after every write.
 */

import { parseFile } from './md/parse.js';
import { toggleTaskDone, toggleChildDone, reorderTasks, appendTask, addCategoryHeader, removeCategoryHeader } from './md/serialize.js';
import { extractNotes, setNotes } from './md/notes.js';
import { readFile, writeFile, listDailyFiles, detectConflicts, readDefaultsFile } from './fs/files.js';
import { parseDefaults, applyDefaults } from './md/defaults.js';
import type { Task, ChildTask } from './types.js';
import type { FolderState } from './fs/folder.js';

interface FileCache {
	[filename: string]: Task[];
}

interface NotesEntry {
	text:             string;
	hadDividerOnLoad: boolean;
}

interface AppState {
	folder:          FolderState;
	cache:           FileCache;
	fileHeaders:     Record<string, string[]>;
	notesCache:      Record<string, NotesEntry>;
	backlogHeaders:  string[];
	loading:         boolean;
	conflicts:       string[];
	weekOffset:      number;
	lastError:       string | null;
	/** Period keys already inserted this session — prevents multi-file insertion. */
	defaultsApplied: Set<string>;
}

/** Template written when the app creates a new daily file from scratch. */
const NEW_DAILY_TEMPLATE = '![[Backlog]]\n\n';

export const appState = $state<AppState>({
	folder:          { status: 'none' },
	cache:           {},
	fileHeaders:     {},
	notesCache:      {},
	backlogHeaders:  [],
	loading:         false,
	conflicts:       [],
	weekOffset:      0,
	lastError:       null,
	defaultsApplied: new Set(),
});

/** Extract all # H1 section names from raw file text. */
export function extractH1s(content: string): string[] {
	return content.split('\n')
		.map(l => l.match(/^#\s+(.+)/)?.[1]?.trim())
		.filter((h): h is string => !!h);
}

function fail(msg: string) {
	appState.lastError = msg;
}

/** True when a folder is ready to read. */
export function folderReady(): boolean {
	return appState.folder.status === 'ready';
}

/** The active directory handle, or null. */
function dir(): FileSystemDirectoryHandle | null {
	return appState.folder.status === 'ready' ? appState.folder.handle : null;
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
			filenames.map(async (name) => [name, await readFile(d, name)] as [string, string | null])
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
				const updated = applyDefaults(text, defaults, dateMatch[1], appState.defaultsApplied);
				if (updated !== text) {
					await writeFile(d, name, updated);
					entry[1] = updated;
				}
			}
		}

		appState.cache = Object.fromEntries(
			rawTexts.map(([name, text]) => [name, text ? parseFile(text, name) : []])
		);
		const headers: Record<string, string[]> = Object.fromEntries(
			rawTexts.map(([name, text]) => [name, text ? extractH1s(text) : []])
		);
		const notesEntries: Record<string, NotesEntry> = Object.fromEntries(
			rawTexts.map(([name, text]) => {
				const { notes, hasDivider } = text ? extractNotes(text) : { notes: '', hasDivider: false };
				return [name, { text: notes, hadDividerOnLoad: hasDivider }];
			})
		);
		const backlogText         = await readFile(d, 'Backlog.md');
		const backlogH1s          = backlogText ? extractH1s(backlogText) : [];
		headers['Backlog.md']     = backlogH1s;
		appState.fileHeaders      = headers;
		appState.notesCache       = notesEntries;
		appState.backlogHeaders   = backlogH1s;
		appState.conflicts        = await detectConflicts(d);
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
export async function moveTask(task: Task, targetFilename: string): Promise<void> {
	const d = dir();
	if (!d || task.file === targetFilename) return;

	// ── 1. Append to target ───────────────────────────────────────────────────
	const targetContent = (await readFile(d, targetFilename)) ?? NEW_DAILY_TEMPLATE;
	const taskLine = task.raw;
	const childLines = task.children.map(c => c.raw);
	const block = [taskLine, ...childLines].join('\n');
	const targetUpdated = appendTask(targetContent, block, task.category);
	await writeFile(d, targetFilename, targetUpdated);

	// ── 2. Remove from source (rollback on failure) ───────────────────────────
	try {
		const sourceContent = await readFile(d, task.file);
		if (sourceContent === null) throw new Error('source gone');
		const sourceLines = sourceContent.split('\n');
		sourceLines.splice(task.lineRange[0], task.lineRange[1] - task.lineRange[0] + 1);
		// Remove any blank line left behind at the splice point.
		if (sourceLines[task.lineRange[0]]?.trim() === '' &&
		    (task.lineRange[0] === 0 || sourceLines[task.lineRange[0] - 1]?.trim() === '')) {
			sourceLines.splice(task.lineRange[0], 1);
		}
		await writeFile(d, task.file, sourceLines.join('\n'));
	} catch {
		// Rollback: remove the line we just added to the target.
		const reread = await readFile(d, targetFilename);
		if (reread) {
			const rb = reread.split('\n');
			rb.splice(rb.length - childLines.length - 1, 1 + childLines.length);
			await writeFile(d, targetFilename, rb.join('\n'));
		}
		fail('Move failed — source could not be updated. Change rolled back.');
		return;
	}

	// ── 3. Update cache for both files ────────────────────────────────────────
	const [newTarget, newSource] = await Promise.all([
		readFile(d, targetFilename),
		readFile(d, task.file),
	]);
	if (newTarget) appState.cache[targetFilename] = parseFile(newTarget, targetFilename);
	if (newSource) appState.cache[task.file]      = parseFile(newSource, task.file);
	else           delete appState.cache[task.file];
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
	category: string | null = null
): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = (await readFile(d, filename)) ?? NEW_DAILY_TEMPLATE;
	const updated = appendTask(current, rawLine, category);
	await writeFile(d, filename, updated);
	appState.cache[filename] = parseFile(updated, filename);
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
		const lines = current.split('\n');
		lines.splice(task.lineRange[0], task.lineRange[1] - task.lineRange[0] + 1);
		const updated = lines.join('\n');
		await writeFile(d, task.file, updated);
		appState.cache[task.file] = parseFile(updated, task.file);
	} catch { fail('Could not delete task — check file permissions.'); }
}

/**
 * Update the title of a task in-place, preserving starred markers and duration.
 *
 * @param task     - The task whose title to replace.
 * @param newTitle - Plain text; starred wrapping is re-applied from task.starred.
 */
export async function editTaskTitle(task: Task, newTitle: string): Promise<void> {
	const d = dir();
	if (!d) return;
	const trimmed = newTitle.trim();
	if (!trimmed) return;
	const current = await readFile(d, task.file);
	if (current === null) return;
	const lines = current.split('\n');
	const line  = lines[task.lineRange[0]];
	const m     = line.match(/^(\s*-\s*\[[ xX]\]\s*)(.*)/);
	if (!m) return;
	const prefix   = m[1];
	const rest     = m[2];
	const durMatch = rest.match(/(\s+\d*\.?\d+\s*(?:h|m))$/i);
	const dur      = durMatch ? durMatch[1] : '';
	const titled   = task.starred ? `**${trimmed}**` : trimmed;
	lines[task.lineRange[0]] = `${prefix}${titled}${dur}`;
	const updated = lines.join('\n');
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
	const lines = current.split('\n');
	const line  = lines[task.lineRange[0]];
	// Extract the checkbox prefix and the rest of the line.
	const m = line.match(/^(\s*-\s*\[[ xX]\]\s*)(.*)/);
	if (!m) return;
	const prefix = m[1];
	const rest   = m[2];
	// rest may end with a duration token — preserve it.
	const durMatch = rest.match(/(\s+\d*\.?\d+\s*(?:h|m))$/i);
	const dur      = durMatch ? durMatch[1] : '';
	const titleRaw = durMatch ? rest.slice(0, durMatch.index) : rest;
	const starred  = titleRaw.trim().startsWith('**') && titleRaw.trim().endsWith('**');
	const newTitle = starred
		? titleRaw.trim().slice(2, -2)
		: `**${titleRaw.trim()}**`;
	lines[task.lineRange[0]] = `${prefix}${newTitle}${dur}`;
	const updated = lines.join('\n');
	await writeFile(d, task.file, updated);
	appState.cache[task.file] = parseFile(updated, task.file);
}

/**
 * Return backlog tasks (from Backlog.md), from cache.
 */
export function backlogTasks(): Task[] {
	return appState.cache['Backlog.md'] ?? [];
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
	} catch { fail('Could not save checkbox — check file permissions.'); }
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
	toIndex: number
): Promise<void> {
	const d = dir();
	if (!d || fromIndex === toIndex) return;
	const current = await readFile(d, filename);
	if (current === null) return;
	const tasks   = appState.cache[filename] ?? [];
	const updated = reorderTasks(current, tasks, fromIndex, toIndex);
	await writeFile(d, filename, updated);
	appState.cache[filename] = parseFile(updated, filename);
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
	const lines = current.split('\n');
	lines.splice(task.lineRange[1] + 1, 0, `  - [ ] ${title}`);
	const updated = lines.join('\n');
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
	} catch { fail('Could not save subtask — check file permissions.'); }
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
	days = 30
): { date: string; tasks: Task[] }[] {
	const cutoff = new Date(todayISO + 'T12:00:00');
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffISO = cutoff.toISOString().slice(0, 10);

	return Object.entries(appState.cache)
		.filter(([name]) => {
			const m = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
			return m && m[1] >= cutoffISO && m[1] <= todayISO;
		})
		.map(([name, tasks]) => ({
			date:  name.replace('.md', ''),
			tasks: tasks.filter(t => t.done),
		}))
		.filter(g => g.tasks.length > 0)
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
export async function moveToCategoryInFile(task: Task, targetCategory: string | null): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, task.file);
	if (current === null) return;

	// Remove the task block (parent + children) from the file.
	const lines = current.split('\n');
	lines.splice(task.lineRange[0], task.lineRange[1] - task.lineRange[0] + 1);
	const stripped = lines.join('\n');

	// Append under the new category heading.
	const block = [task.raw, ...task.children.map(c => c.raw)].join('\n');
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
export async function addCategoryToFile(filename: string, name: string): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = (await readFile(d, filename)) ?? NEW_DAILY_TEMPLATE;
	const updated = addCategoryHeader(current, name);
	await writeFile(d, filename, updated);
	appState.cache[filename]       = parseFile(updated, filename);
	appState.fileHeaders[filename] = extractH1s(updated);
	if (filename === 'Backlog.md') appState.backlogHeaders = appState.fileHeaders[filename];
}

/**
 * Remove an H1 category header from a file (tasks under it remain).
 *
 * @param filename - Target file.
 * @param name     - Category name to remove.
 */
export async function deleteCategoryFromFile(filename: string, name: string): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, filename);
	if (current === null) return;
	const updated = removeCategoryHeader(current, name);
	await writeFile(d, filename, updated);
	appState.cache[filename]       = parseFile(updated, filename);
	appState.fileHeaders[filename] = extractH1s(updated);
	if (filename === 'Backlog.md') appState.backlogHeaders = appState.fileHeaders[filename];
}

/**
 * Return notes text for a daily file (empty string if none).
 *
 * @param filename - e.g. "2026-05-13.md"
 */
export function notesFor(filename: string): string {
	return appState.notesCache[filename]?.text ?? '';
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
	const current = (await readFile(d, filename)) ?? '';
	const entry   = appState.notesCache[filename] ?? { text: '', hadDividerOnLoad: false };
	const updated = setNotes(current, text, entry.hadDividerOnLoad);
	await writeFile(d, filename, updated);
	// Update notesCache; hadDividerOnLoad stays fixed for the lifetime of this session.
	appState.notesCache[filename] = { text: text.trim(), hadDividerOnLoad: entry.hadDividerOnLoad };
	// Also keep the task cache in sync (notes live in the same file).
	appState.cache[filename] = parseFile(updated, filename);
}

/**
 * Return all unchecked tasks from past-dated files (overdue items).
 * These also appear in the backlog rail with a red date tag.
 *
 * @param todayISO - Today's date as "YYYY-MM-DD".
 */
export function overdueTasks(todayISO: string): Task[] {
	return Object.entries(appState.cache)
		.filter(([name]) => {
			const m = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
			return m && m[1] < todayISO;
		})
		.flatMap(([, tasks]) => tasks.filter(t => !t.done));
}
