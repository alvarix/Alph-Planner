import type { Task } from "./types.js";

/**
 * Exclude derived task rows whose owning file is already represented elsewhere
 * in the active view. Identity remains source-scoped: titles are deliberately
 * ignored because different Markdown files may contain identical task text.
 *
 * @param tasks - Derived tasks that may otherwise be rendered a second time.
 * @param visibleFiles - Source filenames already represented in the active view.
 * @returns Tasks whose owning files are not currently visible.
 */
export function tasksOutsideVisibleFiles(
	tasks: Task[],
	visibleFiles: ReadonlySet<string>,
): Task[] {
	return tasks.filter((task) => !visibleFiles.has(task.file));
}
