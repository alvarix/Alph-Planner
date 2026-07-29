/**
 * Diagnostic probes for NoModificationAllowedError root cause isolation.
 *
 * When the app fails with a locked-file error, we can't know from the error
 * alone which of several causes is responsible. This module independently
 * tests each candidate system and outputs a structured report.
 *
 * Candidate causes tested:
 *   1. Stale Service Worker — SW is serving old cached JS bundles
 *   2. Stale IndexedDB handle — the stored directory handle is invalid
 *   3. Permission lost — queryPermission returns denied/prompt
 *   4. iCloud path — folder lives under ~/Library/Mobile Documents/
 */

export interface DiagnosticReport {
	/** ISO timestamp of the diagnostic run. */
	timestamp: string;
	/** Error that triggered the diagnostic. */
	triggerError: string;
	/** SW state: controlling this page, waiting for update, etc. */
	serviceWorker: {
		/** Is a SW controlling this page right now? */
		controlling: boolean;
		/** Is there a new SW waiting to activate (implies stale cache)? */
		updateWaiting: boolean;
		/** SW script URL (for version comparison). */
		scriptURL: string | null;
		/** Number of registered SWs for this origin. */
		registrationCount: number;
	};
	/** IndexedDB handle state. */
	indexedDB: {
		/** Does the alph-planner-fs database exist? */
		handleStoreExists: boolean;
		/** Number of stored handles in the database. */
		handleCount: number;
	};
	/** Directory handle state (probed via queryPermission). */
	handle: {
		/** Result of queryPermission({mode:'readwrite'}). */
		readwritePermission: PermissionState | "no-handle";
		/** Result of queryPermission({mode:'read'}). */
		readPermission: PermissionState | "no-handle";
	};
	/** Folder path analysis. */
	folder: {
		/** Folder name from the stored handle. */
		name: string | null;
		/** True if the path suggests iCloud Drive (Mobile Documents). */
		likelyICloud: boolean;
	};
	/** Sorted list of likely causes (most → least likely). */
	likelyCauses: string[];
}

/**
 * Run all diagnostic probes and return a structured report.
 * Call this from the refresh() catch block when a locked error fires.
 *
 * @param handle - The current directory handle (from appState.folder).
 * @param error  - The original error that triggered the diagnostic.
 */
export async function diagnoseAccessFailure(
	handle: FileSystemDirectoryHandle | null,
	error: unknown,
): Promise<DiagnosticReport> {
	const errMsg = error instanceof Error ? error.message : String(error);

	// ── 1. Service Worker probes ──────────────────────────────────────
	let controlling = false;
	let updateWaiting = false;
	let scriptURL: string | null = null;
	let registrationCount = 0;

	if ("serviceWorker" in navigator) {
		controlling = !!navigator.serviceWorker.controller;
		scriptURL = navigator.serviceWorker.controller?.scriptURL ?? null;

		const registrations = await navigator.serviceWorker.getRegistrations();
		registrationCount = registrations.length;
		for (const reg of registrations) {
			if (reg.waiting) {
				updateWaiting = true;
				scriptURL = scriptURL ?? reg.waiting.scriptURL;
			}
			// Also check installing worker (rare but possible).
			if (reg.installing && !updateWaiting) {
				updateWaiting = true;
			}
		}
	}

	// ── 2. IndexedDB probes ───────────────────────────────────────────
	let handleStoreExists = false;
	let handleCount = 0;

	try {
		const dbs = await indexedDB.databases();
		const store = dbs.find((db) => db.name === "alph-planner-fs");
		if (store) {
			handleStoreExists = true;
			// Count handles by opening the DB and reading the store.
			try {
				handleCount = await new Promise<number>((resolve, reject) => {
					const req = indexedDB.open("alph-planner-fs");
					req.onsuccess = () => {
						const db = req.result;
						try {
							const tx = db.transaction("handles", "readonly");
							const os = tx.objectStore("handles");
							const countReq = os.count();
							countReq.onsuccess = () => resolve(countReq.result);
							countReq.onerror = () => reject(countReq.error);
						} catch {
							resolve(0);
						}
						db.close();
					};
					req.onerror = () => reject(req.error);
					req.onblocked = () => resolve(0);
				});
			} catch {
				handleCount = 0;
			}
		}
	} catch {
		// IndexedDB might be blocked or unavailable — non-fatal.
	}

	// ── 3. Handle probes ──────────────────────────────────────────────
	let readwritePermission: PermissionState | "no-handle" = "no-handle";
	let readPermission: PermissionState | "no-handle" = "no-handle";

	if (handle) {
		try {
			readwritePermission = await (handle as any).queryPermission({
				mode: "readwrite",
			});
		} catch {
			readwritePermission = "no-handle";
		}
		try {
			readPermission = await (handle as any).queryPermission({
				mode: "read",
			});
		} catch {
			readPermission = "no-handle";
		}
	}

	// ── 4. Folder path probe ──────────────────────────────────────────
	const name = handle?.name ?? null;
	const likelyICloud = name
		? /icloud|cloudkit|mobile.?documents/i.test(name)
		: false;

	// ── 5. Determine likely causes ────────────────────────────────────
	const causes: string[] = [];

	// Stale SW: controlling + update waiting = stale cache
	if (controlling && updateWaiting) {
		causes.push(
			"stale-sw: Service Worker has a waiting update — cached assets are from an older deploy. Clear cache & reload.",
		);
	}
	// SW controlling but no update — might be fine, but flag if handle is also bad
	if (controlling && !updateWaiting) {
		causes.push(
			"sw-active: Service Worker is active with no pending update. Likely not the SW — check handle or permission.",
		);
	}
	// No SW — can't be stale SW
	if (!controlling) {
		causes.push(
			"no-sw: No Service Worker controlling this page. Stale cache is ruled out.",
		);
	}

	// Stale handle: readwrite permission denied but read permission good
	if (readwritePermission === "denied" || readwritePermission === "prompt") {
		causes.push(
			"handle-rw-denied: Read-write permission is not granted. Click Re-grant access or re-pick the folder.",
		);
	} else if (
		readwritePermission === "granted" &&
		readPermission === "granted"
	) {
		causes.push(
			"handle-ok: Both read and readwrite permission are granted. Handle is valid — the lock is at the filesystem level.",
		);
	}
	// Handle exists but both modes denied — stale handle from old deploy
	if (readwritePermission === "denied" && readPermission === "denied") {
		causes.push(
			"handle-stale: Both permissions denied despite a stored handle. Forget folder & re-pick.",
		);
	}
	// No handle at all
	if (readwritePermission === "no-handle") {
		causes.push("no-handle: No directory handle available. Pick a folder.");
	}

	// IndexedDB: handle exists but permission denied → stale handle
	if (handleStoreExists && handleCount > 0) {
		if (readwritePermission === "denied") {
			causes.push(
				"idb-stale: IndexedDB has a stored handle but permission is denied. Clear the stored handle or Forget folder.",
			);
		}
	}

	// iCloud path
	if (likelyICloud) {
		causes.push(
			"icloud-path: Folder name suggests iCloud Drive. If fixes above don't help, move files to a local folder.",
		);
	}

	// If nothing matched, the cause is unknown.
	if (causes.length === 0) {
		causes.push(
			"unknown: Could not determine cause. Check the full report above.",
		);
	}

	return {
		timestamp: new Date().toISOString(),
		triggerError: errMsg,
		serviceWorker: {
			controlling,
			updateWaiting,
			scriptURL,
			registrationCount,
		},
		indexedDB: { handleStoreExists, handleCount },
		handle: { readwritePermission, readPermission },
		folder: { name, likelyICloud },
		likelyCauses: causes,
	};
}

/**
 * Log the diagnostic report to the console in a readable format.
 * Use console.groupCollapsed so the report is compact by default.
 */
export function logDiagnosticReport(report: DiagnosticReport): void {
	console.groupCollapsed(
		`%c🔍 Access Failure Diagnostic %c${report.timestamp}`,
		"font-weight:bold;",
		"color:#94a3b8;",
	);
	console.log("Trigger:", report.triggerError);

	console.group("Service Worker");
	console.log("  Controlling page:", report.serviceWorker.controlling);
	console.log("  Update waiting:", report.serviceWorker.updateWaiting);
	console.log("  Script URL:", report.serviceWorker.scriptURL);
	console.log("  Registrations:", report.serviceWorker.registrationCount);
	console.groupEnd();

	console.group("IndexedDB");
	console.log("  Handle store exists:", report.indexedDB.handleStoreExists);
	console.log("  Handle count:", report.indexedDB.handleCount);
	console.groupEnd();

	console.group("Directory Handle");
	console.log("  Read-write permission:", report.handle.readwritePermission);
	console.log("  Read permission:", report.handle.readPermission);
	console.groupEnd();

	console.group("Folder");
	console.log("  Name:", report.folder.name);
	console.log("  Likely iCloud:", report.folder.likelyICloud);
	console.groupEnd();

	console.group("Likely causes (most → least)");
	for (const cause of report.likelyCauses) {
		console.log(`  → ${cause}`);
	}
	console.groupEnd();

	console.groupEnd();
}
