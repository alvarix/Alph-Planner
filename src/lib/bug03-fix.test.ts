/**
 * Fix-tests for Bug 03 — Vanishing tasks.
 *
 * These encode the invariants the permanent fix restores:
 *   - section keys are unique even when a file has two uncategorised
 *     sections (pre-H1 tasks and post-week-marker tasks), so Svelte's
 *     {#each (key)} never throws each_key_duplicate;
 *   - relocateTask/relocateChild re-derive a task's line range from
 *     freshly-read text by raw identity, returning null when the line is
 *     gone — the guard that turns a stale-index data-loss splice into a
 *     recoverable sync conflict.
 */

import { describe, it, expect } from "vitest";
import { parseFile, relocateTask, relocateChild } from "./md/parse.js";
import { sectionKey } from "./sections.js";
import type { Task, ChildTask } from "./types.js";

const BACKLOG = `
- [ ] DMV Registration b4 BM
- [ ] Blog: Alph planner

# PP
- [-] PP: Admin
  - [ ] Sort Media

# MTK

## Added week of 2026-08-10
- [-] BM Packing 2h
`;

function buildSections(tasks: Task[], headers: string[] = []) {
	const result: { category: string | null; tasks: Task[] }[] = [];
	for (const t of tasks) {
		const last = result.at(-1);
		if (last && last.category === t.category) last.tasks.push(t);
		else result.push({ category: t.category, tasks: [t] });
	}
	const seen = new Set(result.map((s) => s.category));
	for (const h of headers) if (!seen.has(h)) result.push({ category: h, tasks: [] });
	return result;
}

describe("sectionKey — unique keys for {#each}", () => {
	it("two null-category sections get distinct keys", () => {
		const tasks = parseFile(BACKLOG, "Backlog.md");
		const sections = buildSections(tasks, ["PP", "MTK"]);
		const nullSections = sections.filter((s) => s.category === null);
		expect(nullSections).toHaveLength(2);

		const keys = sections.map((s, i) => sectionKey(s.category, i));
		expect(new Set(keys).size).toBe(keys.length);
		// Both null sections are present and distinct.
		const nullKeys = keys.filter((k) => k.startsWith("__none__#"));
		expect(nullKeys).toHaveLength(2);
		expect(nullKeys[0]).not.toBe(nullKeys[1]);
	});

	it("duplicate H1 headers also get distinct keys via the index", () => {
		const sections = [
			{ category: "PP", tasks: [] },
			{ category: "PP", tasks: [] },
		];
		const keys = sections.map((s, i) => sectionKey(s.category, i));
		expect(new Set(keys).size).toBe(2);
	});
});

describe("relocateTask — re-derive line range by raw identity", () => {
	it("returns the fresh task when the cached lineRange is still valid", () => {
		const content = "- [ ] buy milk\n- [x] walk dog\n";
		const [task] = parseFile(content, "2026-08-07.md");
		const fresh = relocateTask(content, task);
		expect(fresh).not.toBeNull();
		expect(fresh!.lineRange).toEqual(task.lineRange);
	});

	it("returns the corrected range when lines were inserted above the task", () => {
		// Task captured at index 0, then a heading is inserted above it.
		const before = "- [-] BM Packing 2h\n";
		const after = "## Added week of 2026-08-10\n- [-] BM Packing 2h\n";
		const [stale] = parseFile(before, "Backlog.md");
		const fresh = relocateTask(after, stale);
		expect(fresh).not.toBeNull();
		expect(fresh!.lineRange[0]).toBe(1);
	});

	it("returns null when the raw line is gone (file changed under us)", () => {
		const before = "- [ ] gone now\n";
		const after = "- [ ] something else entirely\n";
		const [stale] = parseFile(before, "Backlog.md");
		expect(relocateTask(after, stale)).toBeNull();
	});

	it("disambiguates duplicate raw lines by proximity to the cached index", () => {
		const content = "- [ ] same\n- [ ] same\n";
		const tasks = parseFile(content, "Backlog.md");
		const second = tasks[1]; // cached index 1
		const fresh = relocateTask(content, second);
		expect(fresh).not.toBeNull();
		expect(fresh!.lineRange[0]).toBe(1);
	});

	it("still locates a task when the disk line was whitespace-normalized (trailing space)", () => {
		// Cache holds a trailing-space raw; disk had it trimmed (Obsidian/iCloud).
		const cached = parseFile("- [-] BM Packing 2h \n", "Backlog.md");
		const disk = "- [-] BM Packing 2h\n";
		const fresh = relocateTask(disk, cached[0]);
		expect(fresh).not.toBeNull();
		expect(fresh!.lineRange[0]).toBe(0);
		// The returned task carries the disk-exact raw (no trailing space).
		expect(fresh!.raw).toBe("- [-] BM Packing 2h");
	});

	it("still locates a task across a CRLF -> LF line-ending normalization", () => {
		// Cache holds a CRLF raw; disk was re-saved with LF.
		const cached = parseFile("- [-] BM Packing 2h\r\n", "Backlog.md");
		const disk = "- [-] BM Packing 2h\n";
		const fresh = relocateTask(disk, cached[0]);
		expect(fresh).not.toBeNull();
		expect(fresh!.lineRange[0]).toBe(0);
	});

	it("prefers an exact match over a trimmed one when both exist", () => {
		const content = "- [ ] a \n- [ ] a\n"; // first has trailing space
		const tasks = parseFile(content, "Backlog.md");
		// Cached task is the second (no trailing space) at index 1.
		const fresh = relocateTask(content, tasks[1]);
		expect(fresh).not.toBeNull();
		expect(fresh!.lineRange[0]).toBe(1);
	});
});

describe("relocateChild — re-derive child line index by raw identity", () => {
	it("returns the fresh child with the correct lineIndex", () => {
		const content = "- [ ] parent\n  - [ ] child one\n  - [x] child two\n";
		const [parent] = parseFile(content, "2026-08-07.md");
		const child = parent.children[1];
		const fresh = relocateChild(content, parent, child);
		expect(fresh).not.toBeNull();
		expect(fresh!.lineIndex).toBe(child.lineIndex);
	});

	it("returns null when the parent line is gone", () => {
		const content = "- [ ] parent\n  - [ ] child one\n";
		const [parent] = parseFile(content, "2026-08-07.md");
		const child = parent.children[0] as ChildTask;
		expect(relocateChild("- [ ] different parent\n", parent, child)).toBeNull();
	});

	it("returns null when the child line is gone", () => {
		const content = "- [ ] parent\n  - [ ] child one\n";
		const [parent] = parseFile(content, "2026-08-07.md");
		const child = parent.children[0] as ChildTask;
		expect(relocateChild("- [ ] parent\n  - [ ] other child\n", parent, child)).toBeNull();
	});
});
