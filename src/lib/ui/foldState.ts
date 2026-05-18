/**
 * Persist category fold state in localStorage.
 * Key structure: "fold:<file>:<category>" → "1" | "0"
 */

const PREFIX = 'fold:';

function key(file: string, category: string): string {
	return `${PREFIX}${file}:${category}`;
}

export function isFolded(file: string, category: string): boolean {
	return localStorage.getItem(key(file, category)) === '1';
}

export function toggleFolded(file: string, category: string): void {
	const k = key(file, category);
	localStorage.setItem(k, localStorage.getItem(k) === '1' ? '0' : '1');
}

/** Unfold all categories in a file by clearing their fold keys. */
export function unfoldAll(file: string, categories: string[]): void {
	for (const cat of categories) {
		localStorage.removeItem(key(file, cat));
	}
}

/** True if any category in the list is folded. */
export function anyFolded(file: string, categories: string[]): boolean {
	return categories.some(c => isFolded(file, c));
}
