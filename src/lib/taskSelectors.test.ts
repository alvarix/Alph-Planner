import { describe, expect, it } from "vitest";
import { parseFile } from "./md/parse.js";
import { tasksOutsideVisibleFiles } from "./taskSelectors.js";

/** Build one task with a real source-file identity. */
function task(filename: string, title: string) {
	return parseFile(`- [ ] ${title}`, filename)[0];
}

describe("tasksOutsideVisibleFiles", () => {
	it("excludes a task whose source day is already visible", () => {
		const visibleTask = task("2026-08-05.md", "visible overdue task");

		expect(
			tasksOutsideVisibleFiles(
				[visibleTask],
				new Set(["2026-08-05.md"]),
			),
		).toEqual([]);
	});

	it("retains a task whose source day is not visible", () => {
		const hiddenTask = task("2026-07-30.md", "hidden overdue task");

		expect(
			tasksOutsideVisibleFiles(
				[hiddenTask],
				new Set(["2026-08-05.md"]),
			),
		).toEqual([hiddenTask]);
	});

	it("uses source filename rather than title to distinguish tasks", () => {
		const visibleTask = task("2026-08-05.md", "same title");
		const hiddenTask = task("2026-07-30.md", "same title");

		expect(
			tasksOutsideVisibleFiles(
				[visibleTask, hiddenTask],
				new Set(["2026-08-05.md"]),
			),
		).toEqual([hiddenTask]);
	});

	it("retains a Backlog.md task because no daily column owns it", () => {
		const backlogTask = task("Backlog.md", "real backlog task");

		expect(
			tasksOutsideVisibleFiles(
				[backlogTask],
				new Set(["2026-08-05.md"]),
			),
		).toEqual([backlogTask]);
	});

	it("retains all tasks when no daily files are visible", () => {
		const overdue = [
			task("2026-08-04.md", "first"),
			task("2026-08-05.md", "second"),
		];

		expect(tasksOutsideVisibleFiles(overdue, new Set())).toEqual(overdue);
	});
});
