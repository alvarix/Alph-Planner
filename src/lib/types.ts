export interface ChildTask {
	/** Line index within the file (0-based). */
	lineIndex: number;
	title: string;
	done: boolean;
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
	done: boolean;
	children: ChildTask[];
	/** Original parent line verbatim — used for round-trip write-back. */
	raw: string;
}
