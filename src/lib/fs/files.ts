/**
 * Read, write, and list Markdown files in the chosen daily folder.
 * All operations go through the FileSystemDirectoryHandle stored in state.
 */

/**
 * Typed error for file system failures.
 * Callers can distinguish "file not found" (expected, return null) from
 * "permission denied" (actionable — user must re-grant access) from
 * generic I/O failures.
 */
export class FsError extends Error {
	constructor(
		/** Reason category for programmatic branching. */
		public readonly reason: "not-found" | "permission" | "locked" | "io",
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "FsError";
	}
}

/**
 * Map a raw browser FSAA error to a typed FsError.
 * @param err - The raw caught value.
 */
function classifyError(err: unknown): FsError {
	const e = err as any;
	if (e?.name === "NotAllowedError" || e?.name === "SecurityError") {
		return new FsError("permission", "File system permission denied", {
			cause: e,
		});
	}
	if (e?.name === "NotFoundError") {
		return new FsError("not-found", "File not found", { cause: e });
	}
	// NoModificationAllowedError: Chrome throws this when iCloud has locked a file
	// or when the filesystem entry cannot be written (e.g. stale PWA handle).
	// InvalidStateError: Chromium may throw this on a stale writable stream.
	if (
		e?.name === "NoModificationAllowedError" ||
		e?.name === "InvalidStateError"
	) {
		return new FsError("locked", "File temporarily locked or inaccessible", {
			cause: e,
		});
	}
	return new FsError("io", e?.message ?? "Unknown file system error", {
		cause: e,
	});
}

/**
 * Read a file by name from the directory.
 * Returns null if the file does not exist.
 * Throws FsError('permission') if access was revoked — callers should
 * surface this rather than treating it as a missing file.
 *
 * @param dir      - Directory handle.
 * @param filename - Bare filename, e.g. "2026-05-12.md".
 */
export async function readFile(
	dir: FileSystemDirectoryHandle,
	filename: string,
): Promise<string | null> {
	try {
		const fh = await dir.getFileHandle(filename);
		const file = await fh.getFile();
		return await file.text();
	} catch (err: any) {
		const fsErr = classifyError(err);
		if (fsErr.reason === "not-found") return null;
		console.error("[readFile]", { filename, reason: fsErr.reason, err });
		throw fsErr;
	}
}

/**
 * Write content to a file, creating it if it doesn't exist.
 * Throws FsError on permission or I/O failure.
 *
 * @param dir      - Directory handle.
 * @param filename - Bare filename.
 * @param content  - Full file text to write.
 */
/** Max retries and delay (ms) for transient locked-file errors (e.g. iCloud sync). */
const WRITE_MAX_RETRIES = 2;
const WRITE_RETRY_DELAY_MS = 800;

export async function writeFile(
	dir: FileSystemDirectoryHandle,
	filename: string,
	content: string,
	_attempt = 0,
): Promise<void> {
	try {
		const fh = await dir.getFileHandle(filename, { create: true });
		const stream = await fh.createWritable();
		await stream.write(content);
		await stream.close();
	} catch (err: any) {
		const fsErr = classifyError(err);
		// Retry transient locks (iCloud sync) before giving up.
		if (fsErr.reason === "locked" && _attempt < WRITE_MAX_RETRIES) {
			await new Promise((r) => setTimeout(r, WRITE_RETRY_DELAY_MS));
			return writeFile(dir, filename, content, _attempt + 1);
		}
		console.error("[writeFile]", {
			filename,
			reason: fsErr.reason,
			attempt: _attempt,
			err,
		});
		throw fsErr;
	}
}

/**
 * List all .md filenames in the directory, sorted ascending.
 * Filters to daily files (YYYY-MM-DD.md) plus Backlog.md.
 * Throws FsError('permission') if the directory handle has lost access.
 *
 * @param dir - Directory handle.
 */
/** Max retries for directory iteration (iCloud eviction stalls). */
const DIR_MAX_RETRIES    = 3;
const DIR_RETRY_DELAY_MS = 600;

export async function listDailyFiles(
	dir: FileSystemDirectoryHandle,
	_attempt = 0,
): Promise<string[]> {
	const names: string[] = [];
	try {
		for await (const [name] of dir.entries()) {
			if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name) || name === "Backlog.md") {
				names.push(name);
			}
		}
	} catch (err: any) {
		const fsErr = classifyError(err);
		if (fsErr.reason === "locked" && _attempt < DIR_MAX_RETRIES) {
			await new Promise((r) => setTimeout(r, DIR_RETRY_DELAY_MS));
			return listDailyFiles(dir, _attempt + 1);
		}
		console.error("[listDailyFiles]", {
			reason: fsErr.reason,
			attempt: _attempt,
			err,
		});
		throw fsErr;
	}
	return names.sort();
}

/**
 * Read Defaults.md from the selected daily folder (same directory as day files).
 * Returns null if the file doesn't exist.
 *
 * @param dir - Directory handle (the folder the user opened in the app).
 */
export async function readDefaultsFile(
	dir: FileSystemDirectoryHandle,
): Promise<string | null> {
	return readFile(dir, "Defaults.md");
}

/**
 * Detect iCloud conflict copies — files like "2026-05-12 (alvar's MacBook).md".
 * Returns an array of conflict filenames found in the directory.
 *
 * @param dir - Directory handle.
 */
export async function detectConflicts(
	dir: FileSystemDirectoryHandle,
	_attempt = 0,
): Promise<string[]> {
	const conflicts: string[] = [];
	try {
		for await (const [name] of dir.entries()) {
			if (/\(.*\)\.md$/.test(name)) conflicts.push(name);
		}
	} catch (err: any) {
		const fsErr = classifyError(err);
		if (fsErr.reason === "locked" && _attempt < DIR_MAX_RETRIES) {
			await new Promise((r) => setTimeout(r, DIR_RETRY_DELAY_MS));
			return detectConflicts(dir, _attempt + 1);
		}
		console.warn("[detectConflicts]", {
			reason: fsErr.reason,
			attempt: _attempt,
			err,
		});
		// Non-fatal: return empty rather than crashing refresh.
	}
	return conflicts;
}
