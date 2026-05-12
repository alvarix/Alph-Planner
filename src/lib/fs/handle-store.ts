/**
 * Persist and retrieve a FileSystemDirectoryHandle across page loads via IndexedDB.
 * The handle itself can't be stored in localStorage (not serialisable), so IDB is the
 * only browser API that can hold it.
 */

const DB_NAME  = 'alph-planner-fs';
const DB_VER   = 1;
const STORE    = 'handles';
const KEY      = 'daily-folder';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VER);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror   = () => reject(req.error);
	});
}

/** Save the directory handle so it survives page reloads. */
export async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx  = db.transaction(STORE, 'readwrite');
		const req = tx.objectStore(STORE).put(handle, KEY);
		req.onsuccess = () => resolve();
		req.onerror   = () => reject(req.error);
	});
}

/** Retrieve the stored handle, or null if none has been saved. */
export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx  = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(KEY);
		req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
		req.onerror   = () => reject(req.error);
	});
}

/** Remove the stored handle (e.g. user switches folders). */
export async function clearHandle(): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx  = db.transaction(STORE, 'readwrite');
		const req = tx.objectStore(STORE).delete(KEY);
		req.onsuccess = () => resolve();
		req.onerror   = () => reject(req.error);
	});
}
