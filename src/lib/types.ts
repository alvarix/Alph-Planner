/** Tri-state task status. */
export type TaskStatus = "todo" | "in-progress" | "done";

/** How serious a user-facing error is. Drives toast colour. */
export type ErrorSeverity = "info" | "warn";

/** What the user should do next. Drives recovery affordances. */
export type ErrorRecovery = "none" | "retry" | "reload" | "reconnect";

/**
 * Structured user-facing error.
 *
 * `info` severity means the app handled it safely — no data was lost and the
 * cache has already been re-synced from disk; the user may retry the action.
 * `warn` severity means a write actually failed and the screen may have been
 * stale; the app reloads the cache from disk to reconverge.
 */
export interface AppError {
	/** One short user-facing sentence. */
	message: string;
	severity: ErrorSeverity;
	recovery: ErrorRecovery;
}

/** A single entry in the in-memory change log (git-tree panel). */
export interface ChangeEntry {
	timestamp: Date;
	/** Single-character symbol for the action type. */
	icon: string;
	/** Past-tense verb, e.g. "Completed", "Added", "Deleted". */
	action: string;
	/** Filename affected, e.g. "2026-05-12.md". */
	file: string;
	/** Human-readable detail, e.g. task title. */
	detail: string;
}

export interface ChildTask {
	/** Line index within the file (0-based). */
	lineIndex: number;
	title: string;
	status: TaskStatus;
	/** Original line verbatim — used for round-trip write-back. */
	raw: string;
}

export interface Task {
	/** Filename, e.g. "2026-05-12.md" or "Backlog.md". */
	file: string;
	/** ISO date string or null for Backlog.md entries. */
	date: string | null;
	/** [startLine, endLine] inclusive, covering parent + all children (0-based). */
	lineRange: [number, number];
	/** H1 section name this task falls under, or null if before any H1. */
	category: string | null;
	title: string;
	starred: boolean;
	estimateMin: number | null;
	status: TaskStatus;
	children: ChildTask[];
	/** Original parent line verbatim — used for round-trip write-back. */
	raw: string;
	/** True when this task was auto-inserted from Defaults.md. */
	fromDefaults?: boolean;
}
