/**
 * Unit tests for files.ts — FS error classification and retry logic.
 *
 * Does not test actual browser File System Access API calls (those need
 * Playwright + a real browser). Tests classifyError, FsError, and the retry
 * behavior embedded in writeFile / listDailyFiles / detectConflicts.
 */

import { describe, it, expect, vi } from "vitest";
import {
	FsError,
	readFile,
	writeFile,
	listDailyFiles,
	detectConflicts,
	classifyFolderError,
} from "./files.js";

// ── Helpers ────────────────────────────────────────────────────────────

/** Create a mock DOMException with name and message. */
function domErr(name: string, message = "test error"): DOMException {
	const e = new DOMException(message, name);
	// Vitest's DOMException doesn't always set .name reliably, so force it.
	Object.defineProperty(e, "name", { value: name, writable: false });
	return e;
}

/**
 * Build a mock FileSystemDirectoryHandle whose methods throw or resolve.
 */
function mockDir(
	opts: {
		entries?: () => AsyncIterable<[string]>;
		getFileHandle?: () => FileSystemFileHandle;
		removeEntry?: () => Promise<void>;
		createWritable?: () => FileSystemWritableFileStream;
	} = {},
): FileSystemDirectoryHandle {
	const dir = {} as Record<string, any>;

	if (opts.entries) {
		dir.entries = vi.fn(opts.entries);
	}

	if (opts.getFileHandle) {
		dir.getFileHandle = vi.fn(opts.getFileHandle) as any;
	} else {
		dir.getFileHandle = vi.fn(
			() =>
				({
					getFile: () => ({ text: async () => "content" }),
					createWritable:
						opts.createWritable ??
						(() => {
							const stream = { write: vi.fn(), close: vi.fn() };
							return stream;
						}),
				}) as any,
		);
	}

	if (opts.removeEntry) {
		dir.removeEntry = vi.fn(opts.removeEntry);
	} else {
		dir.removeEntry = vi.fn(() => Promise.resolve());
	}

	return dir as FileSystemDirectoryHandle;
}

/** Construct a minimal async iterable from a list of [name] tuples. */
async function* entriesFrom(names: string[]): AsyncIterable<[string]> {
	for (const n of names) yield [n];
}

/**
 * Stub setTimeout so it runs the callback synchronously.
 * This makes retry delays resolve immediately without fake timers.
 */
function stubSyncTimeout() {
	vi.stubGlobal("setTimeout", (fn: () => void) => {
		fn();
		return 1 as any;
	});
}

// ── FsError ────────────────────────────────────────────────────────────

describe("FsError", () => {
	it("sets name to FsError", () => {
		const e = new FsError("io", "msg");
		expect(e.name).toBe("FsError");
	});

	it("stores reason", () => {
		expect(new FsError("not-found", "").reason).toBe("not-found");
		expect(new FsError("permission", "").reason).toBe("permission");
		expect(new FsError("locked", "").reason).toBe("locked");
		expect(new FsError("io", "").reason).toBe("io");
	});

	it("stores message", () => {
		expect(new FsError("io", "disk full").message).toBe("disk full");
	});

	it("chains cause via ErrorOptions", () => {
		const cause = new Error("underlying");
		const e = new FsError("io", "wrapped", { cause });
		expect(e.cause).toBe(cause);
	});
});

// ── classifyError (indirect) ───────────────────────────────────────────

describe("classifyError (indirect)", () => {
	it("maps NotAllowedError → permission", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("NotAllowedError");
			},
		});
		const result = readFile(dir, "test.md");
		await expect(result).rejects.toMatchObject({
			name: "FsError",
			reason: "permission",
		});
	});

	it("maps SecurityError → permission", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("SecurityError");
			},
		});
		const result = readFile(dir, "test.md");
		await expect(result).rejects.toMatchObject({
			name: "FsError",
			reason: "permission",
		});
	});

	it("maps NotFoundError → not-found (returns null from readFile)", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("NotFoundError");
			},
		});
		await expect(readFile(dir, "test.md")).resolves.toBeNull();
	});

	it("maps NoModificationAllowedError → locked", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("NoModificationAllowedError");
			},
		});
		const result = readFile(dir, "test.md");
		await expect(result).rejects.toMatchObject({
			name: "FsError",
			reason: "locked",
		});
	});

	it("maps InvalidStateError → locked", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("InvalidStateError");
			},
		});
		const result = readFile(dir, "test.md");
		await expect(result).rejects.toMatchObject({
			name: "FsError",
			reason: "locked",
		});
	});

	it("maps unknown error names → io", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("SomeRandomError", "boom");
			},
		});
		const result = readFile(dir, "test.md");
		await expect(result).rejects.toMatchObject({
			name: "FsError",
			reason: "io",
			message: "boom",
		});
	});

	it("maps non-Error objects → io", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				// eslint-disable-next-line no-throw-literal -- test: browsers throw non-Error values
				throw { message: "just a string" };
			},
		});
		const result = readFile(dir, "test.md");
		await expect(result).rejects.toMatchObject({
			name: "FsError",
			reason: "io",
		});
	});

	it("preserves original error as cause", async () => {
		const orig = domErr("NoModificationAllowedError", "can not modify");
		const dir = mockDir({
			getFileHandle: () => {
				throw orig;
			},
		});
		const result = readFile(dir, "test.md");
		await expect(result).rejects.toMatchObject({ cause: orig });
	});
});

// ── writeFile retry behaviour ──────────────────────────────────────────

describe("writeFile retry", () => {
	it("writes successfully on first attempt", async () => {
		let written = "";
		const stream = {
			write: vi.fn((s: string) => {
				written = s;
			}),
			close: vi.fn(),
		};
		const dir = mockDir({
			createWritable: () => stream as any,
		});
		await writeFile(dir, "test.md", "hello");
		expect(written).toBe("hello");
		expect(stream.close).toHaveBeenCalled();
	});

	it("retries on NoModificationAllowedError and succeeds", async () => {
		let calls = 0;
		const stream = { write: vi.fn(), close: vi.fn() };
		const dir = mockDir({
			getFileHandle: () => {
				calls++;
				if (calls < 2) throw domErr("NoModificationAllowedError");
				return {
					getFile: () => ({ text: async () => "" }),
					createWritable: () => stream,
				} as any;
			},
		});

		stubSyncTimeout();
		await writeFile(dir, "test.md", "data");
		vi.unstubAllGlobals();

		expect(calls).toBe(2); // initial + 1 retry.
	});

	it("throws after exhausting retries (2 retries = 3 total attempts)", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("NoModificationAllowedError");
			},
		});

		stubSyncTimeout();
		await expect(writeFile(dir, "test.md", "data")).rejects.toMatchObject({
			name: "FsError",
			reason: "locked",
		});
		vi.unstubAllGlobals();
	});

	it("does NOT retry on non-locked errors", async () => {
		let calls = 0;
		const dir = mockDir({
			getFileHandle: () => {
				calls++;
				throw domErr("NotAllowedError");
			},
		});

		await expect(writeFile(dir, "test.md", "data")).rejects.toMatchObject({
			reason: "permission",
		});
		expect(calls).toBe(1); // No retry.
	});
});

// ── listDailyFiles retry behaviour ─────────────────────────────────────

describe("listDailyFiles retry", () => {
	it("lists and filters daily files + Backlog", async () => {
		const dir = mockDir({
			entries: () =>
				entriesFrom([
					"2026-07-01.md",
					"2026-07-02.md",
					"Backlog.md",
					"readme.txt",
					"notes.md",
				]),
		});
		const names = await listDailyFiles(dir);
		expect(names).toEqual(["2026-07-01.md", "2026-07-02.md", "Backlog.md"]);
	});

	it("sorts results ascending", async () => {
		const dir = mockDir({
			entries: () =>
				entriesFrom(["2026-07-03.md", "2026-07-01.md", "2026-07-02.md"]),
		});
		expect(await listDailyFiles(dir)).toEqual([
			"2026-07-01.md",
			"2026-07-02.md",
			"2026-07-03.md",
		]);
	});

	it("retries once on NoModificationAllowedError (DIR_MAX_RETRIES=1)", async () => {
		let calls = 0;
		const dir = mockDir({
			entries: () => {
				calls++;
				if (calls === 1) throw domErr("NoModificationAllowedError");
				return entriesFrom(["2026-07-01.md"]);
			},
		});

		stubSyncTimeout();
		const result = await listDailyFiles(dir);
		vi.unstubAllGlobals();

		expect(result).toEqual(["2026-07-01.md"]);
		expect(calls).toBe(2); // Original + 1 retry.
	});

	it("throws after 1 retry is exhausted", async () => {
		const dir = mockDir({
			entries: () => {
				throw domErr("NoModificationAllowedError");
			},
		});

		stubSyncTimeout();
		await expect(listDailyFiles(dir)).rejects.toMatchObject({
			name: "FsError",
			reason: "locked",
		});
		vi.unstubAllGlobals();
	});

	it("does NOT retry on non-locked errors", async () => {
		let calls = 0;
		const dir = mockDir({
			entries: () => {
				calls++;
				throw domErr("NotAllowedError");
			},
		});
		await expect(listDailyFiles(dir)).rejects.toMatchObject({
			reason: "permission",
		});
		expect(calls).toBe(1);
	});
});

// ── detectConflicts retry behaviour ────────────────────────────────────

describe("detectConflicts", () => {
	it("finds conflict-copy filenames", async () => {
		const dir = mockDir({
			entries: () =>
				entriesFrom([
					"2026-07-01.md",
					"2026-07-01 (alvar MacBook).md",
					"Backlog.md",
					"Backlog (conflict copy).md",
				]),
		});
		const conflicts = await detectConflicts(dir);
		expect(conflicts).toEqual([
			"2026-07-01 (alvar MacBook).md",
			"Backlog (conflict copy).md",
		]);
	});

	it("returns empty array on locked error after retries (non-fatal)", async () => {
		const dir = mockDir({
			entries: () => {
				throw domErr("NoModificationAllowedError");
			},
		});

		stubSyncTimeout();
		const result = await detectConflicts(dir);
		vi.unstubAllGlobals();

		expect(result).toEqual([]); // Non-fatal.
	});

	it("returns empty array on non-locked error (non-fatal)", async () => {
		const dir = mockDir({
			entries: () => {
				throw domErr("NotAllowedError");
			},
		});
		await expect(detectConflicts(dir)).resolves.toEqual([]);
	});
});

// ── readFile error handling ────────────────────────────────────────────

describe("readFile", () => {
	it("returns content on success", async () => {
		const dir = mockDir();
		await expect(readFile(dir, "2026-07-01.md")).resolves.toBe("content");
	});

	it("returns null on NotFoundError", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("NotFoundError");
			},
		});
		await expect(readFile(dir, "missing.md")).resolves.toBeNull();
	});

	it("throws FsError on other errors", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("NoModificationAllowedError");
			},
		});
		await expect(readFile(dir, "test.md")).rejects.toMatchObject({
			name: "FsError",
			reason: "locked",
		});
	});

	it("retries on NoModificationAllowedError and succeeds", async () => {
		let calls = 0;
		const dir = mockDir({
			getFileHandle: () => {
				calls++;
				if (calls < 2) throw domErr("NoModificationAllowedError");
				return {
					getFile: () => ({ text: async () => "content" }),
				} as any;
			},
		});

		stubSyncTimeout();
		await expect(readFile(dir, "test.md")).resolves.toBe("content");
		vi.unstubAllGlobals();

		expect(calls).toBe(2);
	});

	it("throws locked after exhausting read retries", async () => {
		const dir = mockDir({
			getFileHandle: () => {
				throw domErr("NoModificationAllowedError");
			},
		});

		stubSyncTimeout();
		await expect(readFile(dir, "test.md")).rejects.toMatchObject({
			name: "FsError",
			reason: "locked",
		});
		vi.unstubAllGlobals();
	});

	it("does NOT retry on non-locked errors", async () => {
		let calls = 0;
		const dir = mockDir({
			getFileHandle: () => {
				calls++;
				throw domErr("NotAllowedError");
			},
		});
		await expect(readFile(dir, "test.md")).rejects.toMatchObject({
			reason: "permission",
		});
		expect(calls).toBe(1);
	});
});

// ── classifyFolderError ────────────────────────────────────────────────

describe("classifyFolderError", () => {
	it("maps NotAllowedError → permission-denied", () => {
		expect(classifyFolderError(domErr("NotAllowedError"))).toBe(
			"permission-denied",
		);
	});

	it("maps SecurityError → permission-denied", () => {
		expect(classifyFolderError(domErr("SecurityError"))).toBe(
			"permission-denied",
		);
	});

	it("maps NoModificationAllowedError → icloud-locked", () => {
		expect(classifyFolderError(domErr("NoModificationAllowedError"))).toBe(
			"icloud-locked",
		);
	});

	it("maps InvalidStateError → icloud-locked", () => {
		expect(classifyFolderError(domErr("InvalidStateError"))).toBe(
			"icloud-locked",
		);
	});

	it("maps NotFoundError → unknown (not a folder-level concern)", () => {
		expect(classifyFolderError(domErr("NotFoundError"))).toBe("unknown");
	});

	it("maps generic errors → unknown", () => {
		expect(classifyFolderError(new Error("boom"))).toBe("unknown");
	});

	it("maps non-Error throws → unknown", () => {
		expect(classifyFolderError("string throw")).toBe("unknown");
	});
});
