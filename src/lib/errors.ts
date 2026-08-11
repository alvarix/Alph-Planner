/**
 * Structured error factories for user-facing failures.
 *
 * Every `fail()` call in `state.svelte.ts` goes through one of these so the
 * wording, severity, and recovery hint stay consistent across the app. The
 * three classes are:
 *
 *  - **fileChanged**: the file changed under us mid-edit. The mutation
 *    aborted safely and the cache was re-synced; the user just retries.
 *    Severity `info` (neutral toast) because nothing broke.
 *  - **writeFailed**: a disk write failed (transient lock, I/O error). The
 *    cache may have been optimistically flipped, so the app reloads from
 *    disk. Severity `warn` (red toast) and the screen reconverges.
 *  - **folder/access**: the folder itself is inaccessible. Recovery is
 *    `reconnect` (folder picker) or `reload`.
 *
 * Keeping these as named factories (not inline strings) means a future
 * wording change touches one place, and a test can assert on a stable
 * `recovery` value instead of a fragile substring.
 */

import type { AppError } from "./types.js";

/** File changed mid-edit; mutation aborted, cache re-synced. Retry the click. */
export const fileChanged = (action: "click" | "edit"): AppError => ({
	message: `File changed while you were ${action === "edit" ? "editing" : "clicking"} — no change saved. Click again to retry.`,
	severity: "info",
	recovery: "retry",
});

/** A write failed; the cache may be stale, so the app reloads from disk. */
export const writeFailed = (action: string): AppError => ({
	message: `Couldn't ${action} — the file may be locked. Reloading to show the real state.`,
	severity: "warn",
	recovery: "reload",
});

/** A cross-file move failed after writing the target; change was rolled back. */
export const moveRolledBack: AppError = {
	message: "Move failed — source could not be updated. Change rolled back.",
	severity: "warn",
	recovery: "reload",
};

/** A week-roll batch failed; no changes were kept. */
export const rollFailed: AppError = {
	message: "Roll week failed — no changes were kept.",
	severity: "warn",
	recovery: "reload",
};

/** Folder permission was revoked; user must re-grant access. */
export const permissionRevoked: AppError = {
	message: "Folder permission was revoked. Click Reconnect to re-grant access.",
	severity: "warn",
	recovery: "reconnect",
};

/** Folder became inaccessible (often iCloud Drive). */
export const folderInaccessible = (hint: string): AppError => ({
	message: hint,
	severity: "warn",
	recovery: "reconnect",
});

/** Refresh failed for a non-permission reason. */
export const refreshFailed = (detail: string): AppError => ({
	message: `Refresh failed: ${detail}`,
	severity: "warn",
	recovery: "reload",
});

/** Validation guard (e.g. only past weeks can be rolled). */
export const invalidAction = (message: string): AppError => ({
	message,
	severity: "info",
	recovery: "none",
});
