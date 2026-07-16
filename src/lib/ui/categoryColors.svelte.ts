/**
 * Stable pastel colours for category section heads.
 *
 * Each category name is hashed to a consistent hue. Collision avoidance
 * ensures visually distinct colours when two categories hash nearby.
 * The same category always produces the same colour regardless of file,
 * day, or rendering order.
 */

/** djb2 hash — fast, deterministic, good distribution on short strings. */
function hashDJB2(s: string): number {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return h >>> 0; // unsigned
}

/**
 * Build a stable hue map for a set of category names.
 * Categories are sorted alphabetically for deterministic collision
 * resolution — the same set always produces the same assignments.
 */
function buildHueMap(cats: string[]): Map<string, number> {
	const sorted = [...cats].sort();
	const map = new Map<string, number>();
	for (const cat of sorted) {
		let hue = hashDJB2(cat.toLowerCase()) % 360;
		// Check against hues already assigned to earlier categories.
		for (const assigned of map.values()) {
			if (Math.abs(hue - assigned) < 20) {
				hue = (assigned + 25) % 360;
			}
		}
		map.set(cat, hue);
	}
	return map;
}

let _map: Map<string, number> | null = null;
let _key = "";

function getMap(cats: string[]): Map<string, number> {
	const k = cats.join(",");
	if (_map && _key === k) return _map;
	_map = buildHueMap(cats);
	_key = k;
	return _map;
}

/**
 * Return a pastel background colour for a category.
 * Returns empty string for null/empty categories — CSS falls back to `var(--bg)`.
 *
 * @param category - Category name, or null for uncategorised.
 * @param allCats  - All active category names in this file (for collision avoidance).
 */
export function catBg(category: string | null, allCats: string[]): string {
	if (!category) return "";
	const m = getMap(allCats);
	const hue = m.get(category);
	if (hue === undefined) return "";
	return `hsl(${hue}, 40%, 91%)`;
}

/**
 * Return a text colour that contrasts with the pastel background.
 * Returns empty string for null/empty — CSS falls back to `var(--text-muted)`.
 */
export function catText(category: string | null, allCats: string[]): string {
	if (!category) return "";
	const m = getMap(allCats);
	const hue = m.get(category);
	if (hue === undefined) return "";
	return `hsl(${hue}, 35%, 30%)`;
}
