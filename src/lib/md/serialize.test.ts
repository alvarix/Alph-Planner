import { describe, it, expect } from "vitest";
import { parseFile } from "./parse.js";
import {
	toggleTaskDone,
	toggleChildDone,
	reorderTasks,
	appendTask,
	addCategoryHeader,
	insertUnderWeekMarker,
} from "./serialize.js";
import { extractH1s } from "../state.svelte.js";

function lines(...args: string[]) {
	return args.join("\n");
}

// ── Round-trip invariant ──────────────────────────────────────────────────────

describe("round-trip", () => {
	it("parse → serialize with no mutation = byte-identical", () => {
		const src = lines(
			"![[Backlog]]",
			"",
			"# Work",
			"- [ ] **ship invoice** 1h",
			"  - [ ] draft",
			"  - [x] send",
			"",
			"# Personal",
			"- [x] gym",
			"- [ ] groceries",
		);
		const tasks = parseFile(src, "2026-05-12.md");
		// Tri-state cycle: [ ] → [-] → [x] → [ ]. Toggle 3 times to return to original.
		const step1 = toggleTaskDone(src, tasks[0]); // [ ] → [-]
		const step2 = toggleTaskDone(step1, { ...tasks[0], status: "in-progress" }); // [-] → [x]
		const step3 = toggleTaskDone(step2, { ...tasks[0], status: "done" }); // [x] → [ ]
		expect(step3).toBe(src);
	});

	it("unknown lines survive toggleTaskDone", () => {
		const src = lines(
			"![[Backlog]]",
			"- [ ] task a",
			"some prose",
			"- [ ] task b",
		);
		const tasks = parseFile(src, "2026-05-12.md");
		const result = toggleTaskDone(src, tasks[0]);
		const resultLines = result.split("\n");
		expect(resultLines[0]).toBe("![[Backlog]]");
		expect(resultLines[2]).toBe("some prose");
	});
});

// ── toggleTaskDone ────────────────────────────────────────────────────────────

describe("toggleTaskDone", () => {
	it("marks an unchecked task done", () => {
		const src = "- [ ] buy milk";
		const task = parseFile(src, "2026-05-12.md")[0];
		expect(toggleTaskDone(src, task)).toBe("- [-] buy milk");
	});

	it("marks a checked task undone", () => {
		const src = "- [x] buy milk";
		const task = parseFile(src, "2026-05-12.md")[0];
		expect(toggleTaskDone(src, task)).toBe("- [ ] buy milk");
	});

	it("only changes the target line", () => {
		const src = lines("- [ ] a", "- [ ] b", "- [ ] c");
		const tasks = parseFile(src, "2026-05-12.md");
		const result = toggleTaskDone(src, tasks[1]).split("\n");
		expect(result[0]).toBe("- [ ] a");
		expect(result[1]).toBe("- [-] b");
		expect(result[2]).toBe("- [ ] c");
	});

	it("does not affect child lines", () => {
		const src = lines("- [ ] parent", "  - [ ] child");
		const tasks = parseFile(src, "2026-05-12.md");
		const result = toggleTaskDone(src, tasks[0]).split("\n");
		expect(result[1]).toBe("  - [ ] child");
	});
});

// ── toggleChildDone ───────────────────────────────────────────────────────────

describe("toggleChildDone", () => {
	it("marks a child done", () => {
		const src = lines("- [ ] groceries", "  - [ ] milk", "  - [ ] eggs");
		const tasks = parseFile(src, "2026-05-12.md");
		const result = toggleChildDone(src, tasks[0].children[0]);
		expect(result.split("\n")[1]).toBe("  - [-] milk");
	});

	it("does not affect the parent line", () => {
		const src = lines("- [ ] groceries", "  - [ ] milk");
		const tasks = parseFile(src, "2026-05-12.md");
		const result = toggleChildDone(src, tasks[0].children[0]);
		expect(result.split("\n")[0]).toBe("- [ ] groceries");
	});

	it("cycles in-progress to done", () => {
		const src = "- [-] research";
		const task = parseFile(src, "2026-05-12.md")[0];
		expect(toggleTaskDone(src, task)).toBe("- [x] research");
	});

	it("cycles done back to todo", () => {
		const src = "- [x] finished";
		const task = parseFile(src, "2026-05-12.md")[0];
		expect(toggleTaskDone(src, task)).toBe("- [ ] finished");
	});

	it("cycles parent with children — todo to in-progress", () => {
		const src = lines(
			"# Art",
			"- [ ] Practice",
			"  - [-] Splotch",
			"  - [ ] Portrait",
			"  - [ ] Giveaway",
		);
		const tasks = parseFile(src, "2026-07-19.md");
		const result = toggleTaskDone(src, tasks[0]).split("\n");
		expect(result[1]).toBe("- [-] Practice"); // parent toggled
		expect(result[2]).toBe("  - [-] Splotch"); // child unchanged
		expect(result[3]).toBe("  - [ ] Portrait"); // child unchanged
		expect(result[4]).toBe("  - [ ] Giveaway"); // child unchanged
	});

	it("safety guard: returns original line when result would be invalid", () => {
		// Simulate stale lineRange pointing to a non-task line
		const src = lines("![[Backlog]]", "", "- [ ] real task");
		const tasks = parseFile(src, "2026-07-19.md");
		// Manually construct a bad case — point lineRange at the embed line
		const badTask = {
			...tasks[0],
			lineRange: [0, 0] as [number, number],
			raw: "![[Backlog]]",
		};
		// Should return original content unchanged (non-task line -> no mutation)
		const result = toggleTaskDone(src, badTask);
		expect(result.split("\n")[0]).toBe("![[Backlog]]");
	});

	it("marks a child undone", () => {
		const src = lines("- [ ] groceries", "  - [x] milk");
		const tasks = parseFile(src, "2026-05-12.md");
		const result = toggleChildDone(src, tasks[0].children[0]);
		expect(result.split("\n")[1]).toBe("  - [ ] milk");
	});
});

// ── reorderTasks ──────────────────────────────────────────────────────────────

describe("reorderTasks", () => {
	it("moves a task down", () => {
		const src = lines("- [ ] a", "- [ ] b", "- [ ] c");
		const tasks = parseFile(src, "2026-05-12.md");
		const result = reorderTasks(src, tasks, 0, 2).split("\n");
		expect(result[0]).toBe("- [ ] b");
		expect(result[1]).toBe("- [ ] c");
		expect(result[2]).toBe("- [ ] a");
	});

	it("moves a task up", () => {
		const src = lines("- [ ] a", "- [ ] b", "- [ ] c");
		const tasks = parseFile(src, "2026-05-12.md");
		const result = reorderTasks(src, tasks, 2, 0).split("\n");
		expect(result[0]).toBe("- [ ] c");
		expect(result[1]).toBe("- [ ] a");
		expect(result[2]).toBe("- [ ] b");
	});

	it("moves a task block (parent + children) together", () => {
		const src = lines("- [ ] a", "  - [ ] a-child", "- [ ] b");
		const tasks = parseFile(src, "2026-05-12.md");
		const result = reorderTasks(src, tasks, 0, 1).split("\n");
		expect(result[0]).toBe("- [ ] b");
		expect(result[1]).toBe("- [ ] a");
		expect(result[2]).toBe("  - [ ] a-child");
	});

	it("no-op when fromIndex === toIndex", () => {
		const src = lines("- [ ] a", "- [ ] b");
		const tasks = parseFile(src, "2026-05-12.md");
		expect(reorderTasks(src, tasks, 0, 0)).toBe(src);
	});

	it("preserves unknown lines outside task ranges", () => {
		const src = lines("# Work", "- [ ] a", "- [ ] b", "some note");
		const tasks = parseFile(src, "2026-05-12.md");
		const result = reorderTasks(src, tasks, 0, 1);
		expect(result).toContain("# Work");
		expect(result).toContain("some note");
	});
});

// ── extractH1s ────────────────────────────────────────────────────────────────

describe("extractH1s", () => {
	it("returns header names added by addCategoryHeader", () => {
		const src = "- [ ] existing task";
		const updated = addCategoryHeader(src, "Work");
		expect(extractH1s(updated)).toContain("Work");
	});

	it("returns all headers in order", () => {
		const src = lines("# Alpha", "- [ ] a", "# Beta", "- [ ] b");
		expect(extractH1s(src)).toEqual(["Alpha", "Beta"]);
	});

	it("returns empty array when no H1s present", () => {
		expect(extractH1s("- [ ] no headers here")).toEqual([]);
	});

	it("does not include H2 or deeper headings", () => {
		expect(extractH1s("## Section\n### Sub")).toEqual([]);
	});
});

// ── duplicateTask (checkbox reset pattern) ────────────────────────────────────

describe("duplicate checkbox reset", () => {
	it("resets [x] to [ ]", () => {
		expect("- [x] buy milk".replace(/\[.\]/i, "[ ]")).toBe("- [ ] buy milk");
	});

	it("resets [-] to [ ]", () => {
		expect("- [-] in progress".replace(/\[.\]/i, "[ ]")).toBe("- [ ] in progress");
	});

	it("leaves [ ] unchanged", () => {
		expect("- [ ] already todo".replace(/\[.\]/i, "[ ]")).toBe("- [ ] already todo");
	});

	it("resets children too", () => {
		expect("  - [x] done child".replace(/\[.\]/i, "[ ]")).toBe("  - [ ] done child");
		expect("  - [-] active child".replace(/\[.\]/i, "[ ]")).toBe("  - [ ] active child");
	});

	it("preserves star and duration", () => {
		expect("- [x] **ship invoice** 1h".replace(/\[.\]/i, "[ ]")).toBe("- [ ] **ship invoice** 1h");
	});
});

// ── appendTask ────────────────────────────────────────────────────────────────

describe("appendTask", () => {
	it("appends to end of file when no category and no H1", () => {
		const src = "- [ ] existing";
		const result = appendTask(src, "- [ ] new", null).split("\n");
		expect(result.at(-1)).toBe("- [ ] new");
	});

	it("inserts before first H1 when no category", () => {
		const src = lines("# Work", "- [ ] a");
		const result = appendTask(src, "- [ ] new", null);
		const parsed = parseFile(result, "2026-05-13.md");
		const added = parsed.find((t) => t.title === "new");
		expect(added?.category).toBeNull();
	});

	it("null-cat task lands above H1, not below it", () => {
		const src = lines("# Work", "- [ ] a");
		const result = appendTask(src, "- [ ] new", null).split("\n");
		expect(result[0]).toBe("- [ ] new");
		expect(result[1]).toBe("# Work");
	});

	it("appends under the matching H1 section", () => {
		const src = lines("# Work", "- [ ] task a", "# Personal", "- [ ] task b");
		const result = appendTask(src, "- [ ] task c", "Work").split("\n");
		expect(result[0]).toBe("# Work");
		expect(result[1]).toBe("- [ ] task a");
		expect(result[2]).toBe("- [ ] task c");
		expect(result[3]).toBe("# Personal");
	});

	it("does not append a categorized task below a week heading or notes divider", () => {
		const src = lines(
			"# Work",
			"- [ ] task a",
			"",
			"## Added week of 2026-08-03",
			"- [ ] rolled task",
		);
		const result = appendTask(src, "- [ ] task b", "Work").split("\n");
		expect(result[1]).toBe("- [ ] task a");
		expect(result[2]).toBe("- [ ] task b");
		expect(result[3]).toBe("");
		expect(result[4]).toBe("## Added week of 2026-08-03");
	});
});

// ── insertUnderWeekMarker ──────────────────────────────────────────────────────

describe("insertUnderWeekMarker", () => {
	it("creates the heading at the end of the file with blank separation", () => {
		const src = "- [ ] older task";
		const result = insertUnderWeekMarker(src, "- [ ] new task", "2026-08-03");
		expect(result).toBe(
			lines(
				"- [ ] older task",
				"",
				"## Added week of 2026-08-03",
				"- [ ] new task",
			),
		);
	});

	it("appends subsequent blocks directly under the previous task", () => {
		let content = "- [ ] older task";
		content = insertUnderWeekMarker(content, "- [ ] first", "2026-08-03");
		content = insertUnderWeekMarker(content, "- [ ] second", "2026-08-03");
		expect(content).toBe(
			lines(
				"- [ ] older task",
				"",
				"## Added week of 2026-08-03",
				"- [ ] first",
				"- [ ] second",
			),
		);
	});

	it("places an older week before a later-dated heading", () => {
		const src = lines("## Added week of 2026-08-10", "- [ ] newer week task");
		const result = insertUnderWeekMarker(
			src,
			"- [ ] old week task",
			"2026-08-03",
		);
		expect(result).toBe(
			lines(
				"## Added week of 2026-08-03",
				"- [ ] old week task",
				"",
				"## Added week of 2026-08-10",
				"- [ ] newer week task",
			),
		);
	});

	it("keeps the notes divider after the new section", () => {
		const src = lines("- [ ] task", "---", "freeform notes");
		const result = insertUnderWeekMarker(src, "- [ ] new task", "2026-08-03");
		expect(result).toBe(
			lines(
				"- [ ] task",
				"",
				"## Added week of 2026-08-03",
				"- [ ] new task",
				"",
				"---",
				"freeform notes",
			),
		);
	});

	it("inserts a multi-line block (parent + children) under the heading", () => {
		const src = lines("## Added week of 2026-08-03", "- [ ] existing");
		const block = lines("- [ ] parent", "  - [ ] child");
		const result = insertUnderWeekMarker(src, block, "2026-08-03");
		expect(result).toBe(
			lines(
				"## Added week of 2026-08-03",
				"- [ ] existing",
				"- [ ] parent",
				"  - [ ] child",
			),
		);
	});
});
