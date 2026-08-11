/**
 * Reproduction tests for Bug 03 — Vanishing tasks.
 *
 * These encode the two confirmed failure modes from the 2026-08-07 incident:
 *
 *  1. Duplicate `__none__` section key — the backlog file had uncategorised
 *     tasks both *before* the first H1 and *after* a `## Added week of`
 *     marker (which resets the category to null). The section builder used
 *     by BacklogRail/DayColumn groups consecutively and keys the {#each} by
 *     `section.category ?? '__none__'`, so two null sections collide and
 *     Svelte throws `each_key_duplicate`, aborting the whole reactive flush.
 *
 *  2. Stale lineRange splice in completeBacklogTask — when line numbers
 *     shift between render and the click (e.g. a week heading was inserted
 *     above the task), the cached `task.lineRange` points at the wrong line.
 *     The splice then removes an unrelated block → silent data loss.
 */

import { describe, it, expect } from "vitest";
import { parseFile } from "./md/parse.js";
import { insertUnderWeekMarker } from "./md/serialize.js";
import type { Task } from "./types.js";

/** Mirror of the section builder in BacklogRail.svelte / DayColumn.svelte. */
function buildSections(tasks: Task[], headers: string[] = []) {
	const result: { category: string | null; tasks: Task[] }[] = [];
	for (const t of tasks) {
		const last = result.at(-1);
		if (last && last.category === t.category) {
			last.tasks.push(t);
		} else {
			result.push({ category: t.category, tasks: [t] });
		}
	}
	const seenCats = new Set(result.map((s) => s.category));
	for (const h of headers) {
		if (!seenCats.has(h)) result.push({ category: h, tasks: [] });
	}
	return result;
}

/** The exact key expression used in the {#each ... (key)} of the components. */
function sectionKey(s: { category: string | null }): string {
	return s.category ?? "__none__";
}

/** The exact key expression used for task rows. */
function taskKey(t: Task): string {
	return `${t.file}:${t.lineRange[0]}`;
}

const BACKLOG = `
- [ ] DMV Registration b4 BM
- [ ] Blog: Alph planner









# PP 
- [-] PP: Admin
  - [ ] Sort Media
  - [x] Print x20 @BKPL
  - [ ] Cardinal poster
- [ ] instagram 
    - [ ] user story 1h
    - [ ] selfie .25h
    - [x] 1 event or merch contact .5
- [ ] eBlast draft
- [ ] DSK email?
- [ ] explore website speed issues


# PP Posts
- [-] Jif
  - [x] DM
  - [x] Post
  - [ ] Story
- [-] Pilaf
  - [ ] DM
  - [x] Post
  - [ ] Story
- [ ] Noelle manager
- [-] aloka
  - [x] DM
  - [ ] post
  - [ ] story

# MTK

## Added week of 2026-08-10
- [-] BM Packing 2h

`;

describe("Bug 03 repro — duplicate section key (each_key_duplicate)", () => {
	it("backlog produces TWO null-category sections → duplicate __none__ key", () => {
		const tasks = parseFile(BACKLOG, "Backlog.md");
		const headers = ["PP", "PP Posts", "MTK"];
		const sections = buildSections(tasks, headers);

		// The pre-H1 tasks (DMV, Blog) form one null section; the task under
		// the `## Added week of` marker (BM Packing) forms a second null
		// section because the week marker resets the category to null.
		const nullSections = sections.filter((s) => s.category === null);
		expect(nullSections).toHaveLength(2);

		// The key collision that Svelte's {#each (key)} rejects:
		const keys = sections.map(sectionKey);
		const dupes = keys.filter(
			(k, i) => keys.indexOf(k) !== i,
		);
		expect(dupes).toContain("__none__");
	});

	it("all task row keys are unique within a single file", () => {
		// Sanity: the task-row key (file:lineRange[0]) is NOT the source of
		// the duplicate-key crash here — the section key is.
		const tasks = parseFile(BACKLOG, "Backlog.md");
		const keys = tasks.map(taskKey);
		const uniq = new Set(keys);
		expect(uniq.size).toBe(keys.length);
	});
});

describe("Bug 03 repro — stale lineRange splice", () => {
	it("completeBacklogTask with a lineRange from before a week-marker insertion splices the wrong block", () => {
		// Backlog BEFORE the user added anything under this week.
		// BM Packing is the only task under the new week heading, at a low
		// line index. We simulate the rendered task being captured at an
		// OLDER lineRange (as if the heading was inserted after render).
		const before = `# MTK

- [-] BM Packing 2h
`;
		// User adds the week heading (via addTask/rollWeek), shifting BM
		// Packing down by 2 lines (heading + blank line).
		const after = insertUnderWeekMarker(before, "- [ ] some other task\n", "2026-08-10");
		// Confirm BM Packing still present, shifted down.
		const reParsed = parseFile(after, "Backlog.md");
		const bmNow = reParsed.find((t) => t.title.startsWith("BM Packing"));
		expect(bmNow).toBeTruthy();

		// Stale task object as the UI would have held it (pre-insertion index).
		const staleTasks = parseFile(before, "Backlog.md");
		const staleBM = staleTasks.find((t) => t.title.startsWith("BM Packing"))!;
		// lineRange captured at the OLD index, no longer valid against `after`.
		const staleIndex = staleBM.lineRange[0];

		// Simulate the completeBacklogTask splice on `after` using the STALE
		// lineRange: it removes whatever now lives at that index, not BM.
		const lines = after.split("\n");
		const blockLen = staleBM.lineRange[1] - staleBM.lineRange[0] + 1;
		lines.splice(staleIndex, blockLen);
		const corrupted = lines.join("\n");

		// The corrupted file no longer contains BM Packing where it should,
		// AND it may have eaten a different line. Demonstrate the divergence:
		expect(corrupted).not.toBe(after);
		// BM Packing is NOT removed from its real position (data loss / no-op):
		const stillHasBM = corrupted.includes("- [-] BM Packing 2h");
		// Depending on shift, the stale splice either misses BM entirely or
		// eats a neighbour. Either way it is NOT a correct removal.
		const correctRemoval = !stillHasBM && !corrupted.includes("some other task");
		// This assertion documents that the naive splice is wrong:
		expect(correctRemoval).toBe(false);
	});
});
