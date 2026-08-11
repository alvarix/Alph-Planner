/**
 * Open a note in Obsidian via the `obsidian://` URL scheme.
 *
 * The vault name is stored in localStorage after the first prompt so the
 * user isn't asked twice. When the chosen folder is the vault root, the
 * file path is just the filename; when it's a subfolder of the vault, the
 * path is `folderName/filename`.
 *
 * @param folderName - The selected planner folder's name.
 * @param filename   - Bare filename, e.g. "2026-05-12.md" or "Backlog.md".
 */
export function openInObsidian(folderName: string, filename: string): void {
	let vaultName = localStorage.getItem("obsidianVault");
	if (!vaultName) {
		vaultName = prompt("Obsidian vault name?", folderName);
		if (!vaultName) return;
		localStorage.setItem("obsidianVault", vaultName);
	}
	const filePath =
		folderName !== vaultName ? `${folderName}/${filename}` : filename;
	window.open(
		`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`,
		"_blank",
	);
}
