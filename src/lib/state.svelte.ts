/**
 * In-memory cache of parsed daily files.
 * Source of truth is always the disk. This cache is rebuilt on every
 * window focus and after every write.
 */

import { parseFile } from './md/parse.js';
import { toggleTaskDone, toggleChildDone, reorderTasks } from './md/serialize.js';
import { readFile, writeFile, listDailyFiles, detectConflicts } from './fs/files.js';
import type { Task, ChildTask } from './types.js';
import type { FolderState } from './fs/folder.js';

interface FileCache {
	[filename: string]: Task[];
}

interface AppState {
	folder:    FolderState;
	cache:     FileCache;
	loading:   boolean;
	conflicts: string[];
	weekOffset: number;
}

export const state = $state<AppState>({
	folder:     { status: 'none' },
	cache:      {},
	loading:    false,
	conflicts:  [],
	weekOffset: 0,
});

/** True when a folder is ready to read. */
export function folderReady(): boolean {
	return state.folder.status === 'ready';
}

/** The active directory handle, or null. */
function dir(): FileSystemDirectoryHandle | null {
	return state.folder.status === 'ready' ? state.folder.handle : null;
}

/**
 * Refresh the in-memory cache from disk.
 * Called on window focus and after every write.
 */
export async function refresh(): Promise<void> {
	const d = dir();
	if (!d) return;

	state.loading = true;
	try {
		const filenames = await listDailyFiles(d);
		const entries   = await Promise.all(
			filenames.map(async (name) => {
				const text = await readFile(d, name);
				return [name, text ? parseFile(text, name) : []] as [string, Task[]];
			})
		);
		state.cache     = Object.fromEntries(entries);
		state.conflicts = await detectConflicts(d);
	} finally {
		state.loading = false;
	}
}

/**
 * Return tasks for a specific daily file, from cache.
 * Returns [] for missing or unloaded files.
 *
 * @param filename - e.g. "2026-05-12.md"
 */
export function tasksForFile(filename: string): Task[] {
	return state.cache[filename] ?? [];
}

/**
 * Return backlog tasks (from Backlog.md), from cache.
 */
export function backlogTasks(): Task[] {
	return state.cache['Backlog.md'] ?? [];
}

/**
 * Toggle a top-level task's done state and write back to disk.
 * Re-parses only the affected file after writing.
 */
export async function toggleTask(task: Task): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, task.file);
	if (current === null) return;
	const updated = toggleTaskDone(current, task);
	await writeFile(d, task.file, updated);
	state.cache[task.file] = parseFile(updated, task.file);
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
	const tasks   = state.cache[filename] ?? [];
	const updated = reorderTasks(current, tasks, fromIndex, toIndex);
	await writeFile(d, filename, updated);
	state.cache[filename] = parseFile(updated, filename);
}

/**
 * Toggle a subtask's done state and write back to disk.
 */
export async function toggleChild(task: Task, child: ChildTask): Promise<void> {
	const d = dir();
	if (!d) return;
	const current = await readFile(d, task.file);
	if (current === null) return;
	const updated = toggleChildDone(current, child);
	await writeFile(d, task.file, updated);
	state.cache[task.file] = parseFile(updated, task.file);
}

/**
 * Return all unchecked tasks from past-dated files (overdue items).
 * These also appear in the backlog rail with a red date tag.
 *
 * @param todayISO - Today's date as "YYYY-MM-DD".
 */
export function overdueTasks(todayISO: string): Task[] {
	return Object.entries(state.cache)
		.filter(([name]) => {
			const m = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
			return m && m[1] < todayISO;
		})
		.flatMap(([, tasks]) => tasks.filter(t => !t.done));
}
