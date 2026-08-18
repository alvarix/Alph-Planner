/**
 * Integration tests for week-end rollover and backlog grouping.
 *
 * These tests exercise the real state.svelte.ts actions against an in-memory
 * mock of the file system layer, so they assert the persisted Markdown —
 * the actual contents of the daily files and Backlog.md — rather than just
 * derived selectors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWeekDays } from "./dates.js";
import { parseFile } from "./md/parse.js";
import {
	appState,
	addTask,
	moveTask,
	rollWeekToBacklog,
	completeToToday,
	toggleTask,
	completeTask,
} from "./state.svelte.js";

/** In-memory filesystem backing the mocked fs module. */
const fs = vi.hoisted(() => {
	const store = new Map<string, string>();
	return {
		store,
		readFile: vi.fn(
			async (_dir: unknown, name: string) => store.get(name) ?? null,
		),
		writeFile: vi.fn(
			async (_dir: unknown, name: string, content: string) => {
				store.set(name, content);
			},
		),
		listDailyFiles: vi.fn(async () => [...store.keys()].sort()),
		detectConflicts: vi.fn(async () => []),
		readDefaultsFile: vi.fn(async () => null),
		classifyFolderError: vi.fn(() => "unknown"),
		FsError: class FsError extends Error {
			reason = "io";
		},
		clearHandle: vi.fn(async () => {}),
	};
});

vi.mock("./fs/files.js", () => ({
	readFile: fs.readFile,
	writeFile: fs.writeFile,
	listDailyFiles: fs.listDailyFiles,
	detectConflicts: fs.detectConflicts,
	readDefaultsFile: fs.readDefaultsFile,
	classifyFolderError: fs.classifyFolderError,
	FsError: fs.FsError,
}));

vi.mock("./fs/handle-store.js", () => ({
	clearHandle: fs.clearHandle,
}));

/** Point the app at the mock folder. */
function setFolderReady(): void {
	appState.folder = {
		status: "ready",
		handle: {} as FileSystemDirectoryHandle,
		name: "test",
	};
}

/** Write one daily file's content to both the mock disk and the cache. */
function seedDay(iso: string, content: string): void {
	fs.store.set(`${iso}.md`, content);
	appState.cache[`${iso}.md`] = parseFile(content, `${iso}.md`);
}

/** Seed a full past week with one todo, one done, one in-progress task/day. */
function seedPastWeek(): string[] {
	const days = getWeekDays(-1);
	for (const day of days) {
		seedDay(
			day.iso,
			[
				`- [ ] todo ${day.iso}`,
				`- [x] done ${day.iso}`,
				`- [-] wip ${day.iso}`,
			].join("\n"),
		);
	}
	return days.map((d) => d.iso);
}

beforeEach(() => {
	fs.store.clear();
	vi.clearAllMocks();
	appState.cache = {};
	appState.backlogHeaders = [];
	appState.lastError = null;
	appState.weekOffset = 0;
	appState.folder = { status: "none" };
});

describe("rollWeekToBacklog", () => {
	it("moves todo and in-progress tasks to Backlog.md under the week heading", async () => {
		setFolderReady();
		const iso = seedPastWeek();
		fs.store.set("Backlog.md", "- [ ] older backlog task\n");

		const n = await rollWeekToBacklog(-1);

		expect(n).toBe(14); // 7 days × 2 unfinished
		const backlog = fs.store.get("Backlog.md")!;
		expect(backlog).toContain(`## Added week of ${iso[0]}`);
		expect(backlog).toContain("- [ ] older backlog task");
		// Older backlog content stays above the new section.
		expect(backlog.indexOf("- [ ] older backlog task")).toBeLessThan(
			backlog.indexOf("## Added week of"),
		);

		// Done tasks remain in their daily files; moved ones are gone.
		for (const day of iso) {
			const file = fs.store.get(`${day}.md`)!;
			expect(file).toContain(`- [x] done ${day}`);
			expect(file).not.toContain(`- [ ] todo ${day}`);
			expect(file).not.toContain(`- [-] wip ${day}`);
		}
	});

	it("is idempotent — a second roll moves nothing and duplicates nothing", async () => {
		setFolderReady();
		seedPastWeek();

		await rollWeekToBacklog(-1);
		const afterFirst = fs.store.get("Backlog.md")!;
		expect((afterFirst.match(/- \[[ x-]\]/g) ?? []).length).toBe(14);

		const n2 = await rollWeekToBacklog(-1);
		expect(n2).toBe(0);
		expect(fs.store.get("Backlog.md")).toBe(afterFirst);
	});

	it("skips missing day files", async () => {
		setFolderReady();
		const days = getWeekDays(-1);
		seedDay(days[0].iso, "- [ ] monday only\n");

		const n = await rollWeekToBacklog(-1);
		expect(n).toBe(1);
		expect(fs.store.get("Backlog.md")).toContain("- [ ] monday only");
	});

	it("refuses a week that is not fully past", async () => {
		setFolderReady();
		seedDay(getWeekDays(0)[0].iso, "- [ ] this week\n");

		expect(await rollWeekToBacklog(0)).toBe(0);
		expect(appState.lastError).toBeTruthy();
		expect(fs.store.get("Backlog.md")).toBeUndefined();

		expect(await rollWeekToBacklog(1)).toBe(0);
	});

	it("preserves children and checkbox state when rolling", async () => {
		setFolderReady();
		const days = getWeekDays(-1);
		seedDay(
			days[0].iso,
			["- [ ] parent task", "  - [ ] child one", "  - [x] child two"].join(
				"\n",
			),
		);

		const n = await rollWeekToBacklog(-1);
		expect(n).toBe(1);
		const backlog = fs.store.get("Backlog.md")!;
		expect(backlog).toContain(
			"- [ ] parent task\n  - [ ] child one\n  - [x] child two",
		);
	});

	it("returns 0 without touching files when there is nothing unfinished", async () => {
		setFolderReady();
		const days = getWeekDays(-1);
		seedDay(days[0].iso, "- [x] all done\n");

		expect(await rollWeekToBacklog(-1)).toBe(0);
		expect(fs.store.get("Backlog.md")).toBeUndefined();
	});

	it("rolls back Backlog.md when a source write fails", async () => {
		setFolderReady();
		seedPastWeek();
		const originalBacklog = "- [ ] older backlog task\n";
		fs.store.set("Backlog.md", originalBacklog);

		// First write (Backlog.md) succeeds, the next (a source file) throws.
		fs.writeFile.mockImplementationOnce(
			async (_d: unknown, name: string, content: string) => {
				fs.store.set(name, content);
			},
		);
		fs.writeFile.mockImplementationOnce(async () => {
			throw new Error("disk full");
		});

		const n = await rollWeekToBacklog(-1);
		expect(n).toBe(0);
		expect(appState.lastError).toBeTruthy();
		expect(fs.store.get("Backlog.md")).toBe(originalBacklog);
	});
});

describe("backlog grouping", () => {
	it("manual no-category adds land under the current week heading", async () => {
		setFolderReady();
		fs.store.set("Backlog.md", "- [ ] older task\n");

		await addTask("Backlog.md", "- [ ] buy milk", null);

		const backlog = fs.store.get("Backlog.md")!;
		expect(backlog).toContain(`## Added week of ${getWeekDays(0)[0].iso}`);
		expect(backlog).toContain("- [ ] buy milk");
		expect(backlog.indexOf("- [ ] older task")).toBeLessThan(
			backlog.indexOf("## Added week of"),
		);
	});

	it("manual categorized adds keep their H1 section", async () => {
		setFolderReady();
		fs.store.set("Backlog.md", "# PP\n- [ ] old pp\n");

		await addTask("Backlog.md", "- [ ] new pp", "PP");

		expect(fs.store.get("Backlog.md")).toBe(
			"# PP\n- [ ] old pp\n- [ ] new pp\n",
		);
	});

	it("drag-to-backlog moves a no-category task under the current week heading", async () => {
		setFolderReady();
		const days = getWeekDays(-1);
		fs.store.set("Backlog.md", "");
		seedDay(days[0].iso, "- [ ] dragged task\n");

		const task = appState.cache[`${days[0].iso}.md`][0];
		await moveTask(task, "Backlog.md");

		const backlog = fs.store.get("Backlog.md")!;
		expect(backlog).toContain(`## Added week of ${getWeekDays(0)[0].iso}`);
		expect(backlog).toContain("- [ ] dragged task");
		expect(fs.store.get(`${days[0].iso}.md`)).not.toContain("dragged task");
	});

	it("rolled tasks parse as uncategorized backlog items", async () => {
		setFolderReady();
		seedPastWeek();

		await rollWeekToBacklog(-1);

		const rolled = appState.cache["Backlog.md"] ?? [];
		expect(rolled.length).toBe(14);
		for (const t of rolled) {
			expect(t.category).toBeNull();
		}
	});
});

describe("completeToToday — stale lineRange safety (Bug 03)", () => {
	it("removes the correct block when a week heading shifted line numbers after render", async () => {
		setFolderReady();
		const today = getWeekDays(0)[0].iso;
		// What the user SAW (rendered) — BM Packing at line index 0.
		const rendered = "- [-] BM Packing 2h\n";
		fs.store.set("Backlog.md", rendered);
		appState.cache["Backlog.md"] = parseFile(rendered, "Backlog.md");
		const task = appState.cache["Backlog.md"][0];
		expect(task.lineRange[0]).toBe(0);

		// Before the click lands, a week heading is inserted above the task —
		// the cached lineRange[0] (0) would now point at the heading line.
		const shifted = "## Added week of 2026-08-10\n- [-] BM Packing 2h\n";
		fs.store.set("Backlog.md", shifted);

		await completeToToday(task, `${today}.md`);

		const backlog = fs.store.get("Backlog.md")!;
		// The task is gone from backlog; the heading is intact; no extra loss.
		expect(backlog).not.toContain("BM Packing");
		expect(backlog).toContain("## Added week of 2026-08-10");
		// Today received the completed block as [x].
		const todayFile = fs.store.get(`${today}.md`)!;
		expect(todayFile).toContain("- [x] BM Packing 2h");
	});

	it("aborts with a sync conflict instead of corrupting when the task is gone", async () => {
		setFolderReady();
		const today = getWeekDays(0)[0].iso;
		const rendered = "- [-] BM Packing 2h\n";
		fs.store.set("Backlog.md", rendered);
		appState.cache["Backlog.md"] = parseFile(rendered, "Backlog.md");
		const task = appState.cache["Backlog.md"][0];

		// File changed under us — the task line is gone entirely.
		fs.store.set("Backlog.md", "- [ ] something else\n");

		await completeToToday(task, `${today}.md`);

		expect(appState.lastError?.message).toContain("File changed");
		// Today was NOT written (no spurious completion).
		expect(fs.store.get(`${today}.md`)).toBeUndefined();
	});
});

describe("moveTask — rollback removes the exact inserted block (Bug 03)", () => {
	it("does not chop real tasks at EOF when the block was inserted mid-file", async () => {
		setFolderReady();
		const src = getWeekDays(-1)[0].iso;
		// Source task lives under a # Work H1 so it carries a category, which
		// makes the move insert UNDER that section in the target (mid-file),
		// not at EOF.
		seedDay(src, "# Work\n- [ ] dragged task\n");
		// Target: the Work section is in the MIDDLE, with a real task after it
		// under a different H1. The old rollback chopped the last N lines
		// (EOF), which would destroy "keep me at EOF" and leave the inserted
		// block in place.
		fs.store.set(
			"Backlog.md",
			"# Work\n- [ ] existing work\n# Personal\n- [ ] keep me at EOF\n",
		);
		appState.cache["Backlog.md"] = parseFile(
			fs.store.get("Backlog.md")!,
			"Backlog.md",
		);

		const task = appState.cache[`${src}.md`][0];

		// Make the SOURCE removal fail (after the target write succeeds) so the
		// rollback path runs. The block is inserted mid-file (under # Work,
		// before # Personal).
		fs.writeFile
			.mockImplementationOnce(
				async (_d: unknown, name: string, content: string) => {
					fs.store.set(name, content);
				},
			)
			.mockImplementationOnce(async () => {
				throw new Error("source write failed");
			});

		await moveTask(task, "Backlog.md");

		// Rollback must remove ONLY the inserted block, leaving the pre-existing
		// EOF task intact — proving the content-based rollback fixed D1. The
		// old EOF-chop rollback would have deleted "keep me at EOF".
		const backlog = fs.store.get("Backlog.md")!;
		expect(backlog).toContain("keep me at EOF");
		expect(backlog).toContain("# Personal");
		expect(backlog).not.toContain("dragged task");
		expect(appState.lastError?.message).toContain("rolled back");
	});
});

describe("structured errors (Bug 03 follow-up)", () => {
	it("relocate-abort is an info error with retry recovery", async () => {
		setFolderReady();
		const today = getWeekDays(0)[0].iso;
		const rendered = "- [-] BM Packing 2h\n";
		fs.store.set("Backlog.md", rendered);
		appState.cache["Backlog.md"] = parseFile(rendered, "Backlog.md");
		const task = appState.cache["Backlog.md"][0];
		// File changed under us — task line gone.
		fs.store.set("Backlog.md", "- [ ] something else\n");

		await completeToToday(task, `${today}.md`);

		expect(appState.lastError).not.toBeNull();
		expect(appState.lastError!.severity).toBe("info");
		expect(appState.lastError!.recovery).toBe("retry");
	});

	it("write-failure is a warn error with reload recovery", async () => {
		setFolderReady();
		const src = getWeekDays(-1)[0].iso;
		seedDay(src, "# Work\n- [ ] dragged task\n");
		fs.store.set("Backlog.md", "# Work\n- [ ] existing work\n# Personal\n- [ ] keep me at EOF\n");
		appState.cache["Backlog.md"] = parseFile(fs.store.get("Backlog.md")!, "Backlog.md");
		const task = appState.cache[`${src}.md`][0];

		fs.writeFile
			.mockImplementationOnce(async (_d: unknown, name: string, c: string) => { fs.store.set(name, c); })
			.mockImplementationOnce(async () => { throw new Error("source write failed"); });

		await moveTask(task, "Backlog.md");

		expect(appState.lastError).not.toBeNull();
		expect(appState.lastError!.severity).toBe("warn");
		expect(appState.lastError!.recovery).toBe("reload");
	});
});

// ── Backlog completion routing (state-layer safety net) ─────────────────────

describe("toggleTask on in-progress backlog tasks routes to completeToToday", () => {
	it("moves to today instead of completing in place", async () => {
		setFolderReady();
		const today = getWeekDays(0).find((d) => d.today)!.iso;

		const backlog = "- [>] should move to today\n";
		fs.store.set("Backlog.md", backlog);
		appState.cache["Backlog.md"] = parseFile(backlog, "Backlog.md");

		const task = appState.cache["Backlog.md"][0];
		expect(task.status).toBe("in-progress");

		await toggleTask(task);

		// Backlog.md no longer holds the task.
		const finalBacklog = fs.store.get("Backlog.md")!;
		expect(finalBacklog).not.toContain("should move to today");

		// Today received the completed block as [x].
		const todayMd = fs.store.get(`${today}.md`)!;
		expect(todayMd).toContain("- [x] should move to today");
	});

	it("stays in backlog when toggling a todo backlog task (first click)", async () => {
		setFolderReady();

		const backlog = "- [ ] todo backlog task\n";
		fs.store.set("Backlog.md", backlog);
		appState.cache["Backlog.md"] = parseFile(backlog, "Backlog.md");

		const task = appState.cache["Backlog.md"][0];
		expect(task.status).toBe("todo");

		await toggleTask(task);

		// Still in backlog, now in-progress.
		const finalBacklog = fs.store.get("Backlog.md")!;
		expect(finalBacklog).toContain("- [>] todo backlog task");

		// Today was NOT written.
		const today = getWeekDays(0).find((d) => d.today)!.iso;
		expect(fs.store.get(`${today}.md`)).toBeUndefined();
	});
});

describe("completeTask on backlog tasks routes to completeToToday", () => {
	it("moves a todo backlog task to today (long-press fallback)", async () => {
		setFolderReady();
		const today = getWeekDays(0).find((d) => d.today)!.iso;

		const backlog = "- [ ] long press fallback\n";
		fs.store.set("Backlog.md", backlog);
		appState.cache["Backlog.md"] = parseFile(backlog, "Backlog.md");

		const task = appState.cache["Backlog.md"][0];
		expect(task.status).toBe("todo");

		await completeTask(task);

		// Backlog.md no longer holds the task.
		const finalBacklog = fs.store.get("Backlog.md")!;
		expect(finalBacklog).not.toContain("long press fallback");

		// Today received the completed block as [x].
		const todayMd = fs.store.get(`${today}.md`)!;
		expect(todayMd).toContain("- [x] long press fallback");
	});
});
