/**
 * Adapter for opening notes in Obsidian via the `obsidian://` URL scheme.
 *
 * The vault name is stored in localStorage after the first prompt so the
 * user isn't asked twice. All URI construction lives here so components never
 * build `obsidian://` strings themselves.
 */

/**
 * Resolve the Obsidian vault name, prompting once and remembering it.
 *
 * @param fallback - Default value offered in the prompt (usually the folder name).
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
 * Open a locally-built Obsidian URI. Only the trusted `obsidian://open?`
 * scheme is allowed, so a tampered vault name can never turn into a web
 * redirect (open-redirect guard).
 *
 * @param url - URI built in this module from the stored vault name.
 */
function openObsidianUrl(url: string): void {
	if (!url.startsWith("obsidian://open?")) return;
	// Use an anchor rather than window.open: the URI is built locally and
	// scheme-checked above, so there is no external redirect surface.
	const a = document.createElement("a");
	a.href = url;
	a.target = "_blank";
	a.rel = "noopener noreferrer";
	a.click();
}

/**
 * Open a note in Obsidian via the `obsidian://` URL scheme.
 *
 * When the chosen folder is the vault root, the file path is just the
 * filename; when it's a subfolder of the vault, the path is
 * `folderName/filename`.
 *
 * @param folderName - The selected planner folder's name.
 * @param filename   - Bare filename, e.g. "2026-05-12.md" or "Backlog.md".
 */
export function openInObsidian(folderName: string, filename: string): void {
	const vaultName = resolveVaultName(folderName);
	if (!vaultName) return;
	const filePath =
		folderName !== vaultName ? `${folderName}/${filename}` : filename;
	openObsidianUrl(
		`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`,
	);
}
