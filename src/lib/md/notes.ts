/**
 * Extract and replace the free-form notes block that lives below the first
 * standalone `---` line in a daily file.
 *
 * The `---` divider is considered "user-typed" if it was present in the file
 * before any notes were saved (tracked by callers via `hadDividerOnLoad`).
 * When notes are cleared:
 *   - user-typed divider → keep `---`, strip content after it
 *   - app-added divider  → remove `---` entirely
 */

const DIVIDER = /^---\s*$/m;

/**
 * Return the text after the first standalone `---` line, and whether the
 * divider was present at all.
 *
 * @param content - Raw file text.
 */
export function extractNotes(content: string): { notes: string; hasDivider: boolean } {
	const match = content.match(DIVIDER);
	if (!match || match.index === undefined) return { notes: '', hasDivider: false };
	return {
		notes:      content.slice(match.index + match[0].length).trimStart(),
		hasDivider: true,
	};
}

/**
 * Write `notes` into the file below `---`, creating or removing the divider
 * as needed.
 *
 * @param content            - Raw file text.
 * @param notes              - New notes text (empty string = clear).
 * @param hadDividerOnLoad   - True if `---` existed before this session started.
 */
export function setNotes(content: string, notes: string, hadDividerOnLoad: boolean): string {
	const match = content.match(DIVIDER);
	const trimmedNotes = notes.trim();

	if (trimmedNotes === '') {
		if (!match || match.index === undefined) return content;
		const before = content.slice(0, match.index).trimEnd();
		return hadDividerOnLoad
			? before + '\n---\n'   // user placed it — keep the divider
			: before + '\n';       // we added it — remove entirely
	}

	if (!match || match.index === undefined) {
		return content.trimEnd() + '\n\n---\n' + trimmedNotes + '\n';
	}

	const before = content.slice(0, match.index);
	return before + '---\n' + trimmedNotes + '\n';
}
