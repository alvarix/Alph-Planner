import type { app as AppType } from './store.svelte.js';

export const STORE_KEY = 'alph-v0';

type AppSnapshot = typeof AppType;

/**
 * Serialize the current app state to localStorage.
 * Fails silently (e.g. private browsing, storage quota exceeded).
 *
 * @param state - The app state object
 */
export function saveState(state: AppSnapshot): void {
  try {
    const data = {
      tasks: state.tasks,
      sessions: state.sessions,
      unscheduled: state.unscheduled,
      config: state.config
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // Silently ignore storage errors
  }
}

/**
 * Load previously saved state from localStorage.
 * Returns null if nothing is saved or parsing fails.
 *
 * @returns Partial app state or null
 */
export function loadState(): Partial<AppSnapshot> | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<AppSnapshot>;
    // Basic validation: must be an object
    if (typeof d !== 'object' || d === null) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Export the full app state as a downloadable JSON file.
 *
 * @param state - The app state object
 */
export function exportJSON(state: AppSnapshot): void {
  const data = {
    tasks: state.tasks,
    sessions: state.sessions,
    unscheduled: state.unscheduled,
    config: state.config
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'alph-planner.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Parse a JSON file selected by the user.
 * Rejects with an Error if the file is not valid JSON.
 *
 * @param file - File object from an input[type=file]
 * @returns Promise resolving to a partial app state object
 */
export function importJSON(file: File): Promise<Partial<AppSnapshot>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const d = JSON.parse(e.target!.result as string) as Partial<AppSnapshot>;
        if (typeof d !== 'object' || d === null) {
          reject(new Error('Invalid JSON structure'));
          return;
        }
        resolve(d);
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });
}
