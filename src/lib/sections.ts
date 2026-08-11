/**
 * Unique key for a `{#each ... (key)}` over derived task sections.
 *
 * The category string alone is NOT a unique section key. A file can have
 * uncategorised tasks in two non-adjacent places — before the first H1 and
 * after a `## Added week of` marker, which resets the parser's category to
 * null — producing two `null`-category sections. Duplicate H1 headers are
 * also legal. Keying the `{#each}` by category alone therefore collides
 * and Svelte throws `each_key_duplicate`, aborting the whole reactive flush
 * (Bug 03: vanishing tasks).
 *
 * Appending the section's position makes the key unique while staying stable
 * enough for the section list, which is rebuilt from file order on every
 * refresh. Task rows are keyed separately (file:lineRange) and are unaffected.
 *
 * @param category - The section's H1 name, or null for "no category".
 * @param index    - The section's index within the derived sections array.
 */
export function sectionKey(category: string | null, index: number): string {
	return `${category ?? "__none__"}#${index}`;
}
