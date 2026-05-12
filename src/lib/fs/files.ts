/**
 * Read, write, and list Markdown files in the chosen daily folder.
 * All operations go through the FileSystemDirectoryHandle stored in state.
 */

/**
 * Read a file by name from the directory. Returns null if it doesn't exist.
 *
 * @param dir      - Directory handle.
 * @param filename - Bare filename, e.g. "2026-05-12.md".
 */
export async function readFile(
	dir: FileSystemDirectoryHandle,
	filename: string
): Promise<string | null> {
	try {
		const fh   = await dir.getFileHandle(filename);
		const file = await fh.getFile();
		return await file.text();
	} catch {
		return null;
	}
}

/**
 * Write content to a file, creating it if it doesn't exist.
 *
 * @param dir      - Directory handle.
 * @param filename - Bare filename.
 * @param content  - Full file text to write.
 */
export async function writeFile(
	dir: FileSystemDirectoryHandle,
	filename: string,
	content: string
): Promise<void> {
	const fh     = await dir.getFileHandle(filename, { create: true });
	const stream = await fh.createWritable();
	await stream.write(content);
	await stream.close();
}

/**
 * List all .md filenames in the directory, sorted ascending.
 * Filters to daily files (YYYY-MM-DD.md) plus Backlog.md.
 *
 * @param dir - Directory handle.
 */
export async function listDailyFiles(dir: FileSystemDirectoryHandle): Promise<string[]> {
	const names: string[] = [];
	for await (const [name] of dir.entries()) {
		if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name) || name === 'Backlog.md') {
			names.push(name);
		}
	}
	return names.sort();
}

/**
 * Detect iCloud conflict copies — files like "2026-05-12 (alvar's MacBook).md".
 * Returns an array of conflict filenames found in the directory.
 *
 * @param dir - Directory handle.
 */
export async function detectConflicts(dir: FileSystemDirectoryHandle): Promise<string[]> {
	const conflicts: string[] = [];
	for await (const [name] of dir.entries()) {
		if (/\(.*\)\.md$/.test(name)) conflicts.push(name);
	}
	return conflicts;
}
