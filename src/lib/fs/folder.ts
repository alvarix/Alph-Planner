/**
 * File System Access API — folder selection and permission management.
 *
 * The browser requires a user gesture to grant a new directory handle.
 * Subsequent loads re-request permission against the stored handle; if the
 * user has not revoked it, permission is granted silently.
 */

import { saveHandle, loadHandle, clearHandle } from "./handle-store.js";

/** Why the folder connection failed — drives recovery UI in FolderPicker. */
export type FolderErrorReason =
	| "permission-denied" // queryPermission returned denied — user must re-grant
	| "icloud-locked" // NoModificationAllowedError on probe/write — likely iCloud Drive
	| "stale-handle" // Permission granted but operations fail — handle from old deploy
	| "transient-lock" // Temporary lock, retry may succeed after a short wait
	| "unknown";

export type FolderState =
	| { status: "none" }
	| { status: "ready"; handle: FileSystemDirectoryHandle; name: string }
	| {
			status: "needs-permission";
			handle: FileSystemDirectoryHandle;
			name: string;
			errorReason?: FolderErrorReason;
	  }
	| { status: "error"; message: string; errorReason?: FolderErrorReason };

/**
 * Show the native folder-picker dialog and persist the chosen handle.
 * Call only from a click handler (requires user gesture).
 */
export async function pickFolder(): Promise<FolderState> {
	try {
		const handle = await (window as any).showDirectoryPicker({
			mode: "readwrite",
		});
		await saveHandle(handle);
		return { status: "ready", handle, name: handle.name };
	} catch (err: any) {
		if (err?.name === "AbortError") return { status: "none" };
		return { status: "error", message: String(err) };
	}
}

/**
 * Try to restore the previously picked folder from IndexedDB.
 * If the handle exists but permission was revoked, returns 'needs-permission'.
 */
export async function restoreFolder(): Promise<FolderState> {
	try {
		const handle = await loadHandle();
		if (!handle) return { status: "none" };

		const perm = await (handle as any).queryPermission({ mode: "readwrite" });
		if (perm === "granted") {
			return { status: "ready", handle, name: handle.name };
		}
		return { status: "needs-permission", handle, name: handle.name };
	} catch {
		return { status: "none" };
	}
}

/**
 * Request permission for a handle that was restored but not yet granted.
 * Must be called from a user gesture.
 */
export async function requestPermission(
	handle: FileSystemDirectoryHandle,
): Promise<FolderState> {
	try {
		const perm = await (handle as any).requestPermission({ mode: "readwrite" });
		if (perm === "granted")
			return { status: "ready", handle, name: handle.name };
		return { status: "error", message: "Permission denied." };
	} catch (err: any) {
		return { status: "error", message: String(err) };
	}
}

/** Remove the stored handle and return to the 'none' state. */
export async function forgetFolder(): Promise<void> {
	await clearHandle();
}
