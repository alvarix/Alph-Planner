/**
 * Open the vault-root planner index note in Obsidian.
 *
 * Kept separate from `obsidian.ts` (which opens notes inside the planner
 * folder): the index note lives at the Obsidian vault root, so its file path
 * is always the bare filename — never prefixed with the planner folder name.
 */

/** Bare filename of the vault's planner index note (lives at the vault root). */
export const PLANNER_INDEX_FILE = "*Alph-planner.md";

/**
 * Resolve the Obsidian vault name, prompting once and remembering it.
 *
 * @param fallback - Default value offered in the prompt.
 * @returns The vault name, or null when the user cancels the prompt.
 */
function resolveVaultName(fallback: string): string | null {
	let vaultName = localStorage.getItem("obsidianVault");
	if (!vaultName) {
		vaultName = prompt("Obsidian vault name?", fallback);
		if (!vaultName) return null;
		localStorage.setItem("obsidianVault", vaultName);
	}
	return vaultName;
}

/**
 * Open the planner index note (`PLANNER_INDEX_FILE`) in Obsidian via the
 * trusted `obsidian://` scheme. The scheme is checked before navigating so a
 * tampered vault name can never turn into a web redirect.
 */
export function openIndexInObsidian(): void {
	const vaultName = resolveVaultName("vault name");
	if (!vaultName) return;
	const url = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(PLANNER_INDEX_FILE)}`;
	if (!url.startsWith("obsidian://open?")) return;
	// Anchor navigation avoids window.open's open-redirect surface.
	const a = document.createElement("a");
	a.href = url;
	a.target = "_blank";
	a.rel = "noopener noreferrer";
	a.click();
}
