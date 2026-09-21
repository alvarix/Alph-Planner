import { test, expect, type Page } from '@playwright/test';

// ── Date helpers (mirror src/lib/dates.ts) ──────────────────────────────────

/** Format a Date as a local "YYYY-MM-DD" string. */
function localISO(d: Date): string {
	const y  = d.getFullYear();
	const m  = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${dd}`;
}

/** Monday-based ISO week, same algorithm as getWeekDays() in dates.ts. */
function weekISOs(offset: number): string[] {
	const now   = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const dow   = today.getDay();
	const toMon = dow === 0 ? -6 : 1 - dow;
	const monday = new Date(today);
	monday.setDate(today.getDate() + toMon + offset * 7);
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(monday);
		d.setDate(monday.getDate() + i);
		return localISO(d);
	});
}

// ── Fake File System Access layer ────────────────────────────────────────────

/**
 * Install an in-memory fake for the File System Access API before any page
 * script runs. `showDirectoryPicker` returns a directory handle backed by a
 * Map of filename → content. Methods live on the prototype so the handle
 * survives the IndexedDB structured clone in saveHandle() (own props are
 * plain strings). The store is exposed on globalThis for assertions.
 */
async function openApp(page: Page, seed: Record<string, string>): Promise<void> {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));

	await page.addInitScript((seedData: Record<string, string>) => {
		const store = new Map<string, string>(Object.entries(seedData));
		(globalThis as any).__alphFs = store;

		function makeFileHandle(name: string) {
			const proto = {
				getFile: async () => ({ text: async () => store.get(name) ?? '' }),
				createWritable: async () => ({
					write: async (content: string) => { store.set(name, content); },
					close:  async () => {},
				}),
			};
			return Object.assign(Object.create(proto), { name, kind: 'file' });
		}

		const dirProto = {
			queryPermission:   async () => 'granted',
			requestPermission: async () => 'granted',
			getFileHandle:     async (fname: string) => makeFileHandle(fname),
			removeEntry:       async (fname: string) => { store.delete(fname); },
			entries: async function* () {
				for (const n of [...store.keys()].sort()) yield [n, makeFileHandle(n)];
			},
		};

		(globalThis as any).showDirectoryPicker = async () =>
			Object.assign(Object.create(dirProto), { name: 'test-folder' });
	}, seed);

	await page.goto('/');
	// No stored handle → folder picker → choose the fake folder.
	await page.locator('.overlay .btn-primary').click();
	await expect(page.locator('#backlog-rail')).toBeVisible();
	await expect(page.locator('#columns .day-col')).toHaveCount(7);
	expect(errors).toHaveLength(0);
}

// ── Smoke ────────────────────────────────────────────────────────────────────

test('page loads with the folder picker when no folder is stored', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.overlay .card h2')).toHaveText('Choose your daily folder');
});

test('opening a folder renders the main UI with seeded data', async ({ page }) => {
	const week = weekISOs(0);
	await openApp(page, {
		'Backlog.md': '- [ ] buy milk\n',
		[`${week[0]}.md`]: '- [ ] monday deep work 1h\n',
		[`${week[6]}.md`]: '- [ ] sunday chill\n',
	});

	await expect(page.locator('h1')).toHaveText('Alph-Planner');
	// Backlog rail shows the seeded task.
	await expect(page.locator('#backlog-rail')).toContainText('buy milk');
	// Tasks render in their day columns.
	await expect(page.locator('.day-col').first()).toContainText('monday deep work');
	await expect(page.locator('.day-col').last()).toContainText('sunday chill');
	// Columns with no file show an empty placeholder.
	await expect(page.locator('.empty-day').first()).toBeVisible();
});

// ── Backlog rendering ────────────────────────────────────────────────────────

test('backlog renders H1 categories and treats week headings as non-categories', async ({ page }) => {
	await openApp(page, {
		'Backlog.md': [
			'## Added week of 2026-08-03',
			'- [ ] rolled in task',
			'',
			'# PP',
			'- [ ] old pp task',
			'',
		].join('\n'),
	});

	const rail = page.locator('#backlog-rail');
	await expect(rail).toContainText('rolled in task');
	await expect(rail).toContainText('old pp task');
	// The H1 becomes a category header; the H2 week heading does not.
	await expect(rail.locator('.cat-name')).toHaveText('PP');
	await expect(rail.locator('.section-head')).toHaveCount(1);
});

// ── Adding tasks ─────────────────────────────────────────────────────────────

test('adding a backlog task writes it under the current week heading', async ({ page }) => {
	const week = weekISOs(0);
	await openApp(page, { 'Backlog.md': '- [ ] older task\n' });

	await page.locator('.rail-head .add-btn').click();
	await page.locator('.add-form .add-input').fill('new manual task');
	await page.keyboard.press('Enter');

	await expect(page.locator('#backlog-rail')).toContainText('new manual task');

	// The persisted file gets the visible separator with this week's Monday.
	const backlogMd = await page.evaluate(() => (globalThis as any).__alphFs.get('Backlog.md'));
	expect(backlogMd).toContain(`## Added week of ${week[0]}`);
	expect(backlogMd).toContain('- [ ] new manual task');
	// Older content stays above the new section.
	expect(backlogMd.indexOf('- [ ] older task')).toBeLessThan(backlogMd.indexOf('## Added week of'));
});

test('adding a task to today writes it to today\'s daily file', async ({ page }) => {
	const todayISO = localISO(new Date());
	await openApp(page, { [`${todayISO}.md`]: '' });

	await page.locator('.day-col.today .btn-add').click();
	await page.locator('.day-col.today .add-input').fill('today task 1h');
	await page.keyboard.press('Enter');

	await expect(page.locator('.day-col.today')).toContainText('today task');
	const todayMd = await page.evaluate(
		(name) => (globalThis as any).__alphFs.get(name),
		`${todayISO}.md`,
	);
	expect(todayMd).toContain('- [ ] today task 1h');
});

// ── Task completion ──────────────────────────────────────────────────────────

test('checking a task cycles todo → in-progress → done', async ({ page }) => {
	const todayISO = localISO(new Date());
	await openApp(page, { [`${todayISO}.md`]: '- [ ] finish this\n' });

	const item = page.locator('.day-col.today .task-item');
	const checkbox = item.locator('input[type=checkbox]');
	await expect(item).toContainText('finish this');

	// First click: todo → in-progress (immediate write).
	await checkbox.click();
	await expect(item).toHaveClass(/in-progress/);

	// Second click: in-progress → done, with a 3-second undo window.
	// The task is optimistically done and the undo button appears.
	await checkbox.click();
	await expect(item).toHaveClass(/pending/);
	await expect(item).toHaveClass(/done/);
	await expect(page.locator('.undo-btn')).toBeVisible();

	// The disk write lands after the 3-second flush.
	await expect
		.poll(async () => page.evaluate((n) => (globalThis as any).__alphFs.get(n), `${todayISO}.md`), {
			timeout: 8000,
		})
		.toContain('- [x] finish this');
});

test('undo cancels a pending completion during the undo window', async ({ page }) => {
	const todayISO = localISO(new Date());
	await openApp(page, { [`${todayISO}.md`]: '- [ ] undo me\n' });

	const item = page.locator('.day-col.today .task-item');
	const checkbox = item.locator('input[type=checkbox]');

	await checkbox.click();
	await expect(item).toHaveClass(/in-progress/);
	await checkbox.click();
	await expect(item).toHaveClass(/pending/);
	await expect(page.locator('.undo-btn')).toBeVisible();

	// Undo: cancels the flush and reverts the optimistic UI. The disk keeps
	// the last flushed state (in-progress) — the [x] write never happened.
	await page.locator('.undo-btn').click();
	await expect(item).toHaveClass(/in-progress/);
	await expect(item).not.toHaveClass(/done/);
	await expect(item).not.toHaveClass(/pending/);
	await expect(page.locator('.undo-btn')).toHaveCount(0);
	const dayMd = await page.evaluate(
		(name) => (globalThis as any).__alphFs.get(name),
		`${todayISO}.md`,
	);
	expect(dayMd).toContain('- [>] undo me');
});

// ── Week-end rollover ────────────────────────────────────────────────────────

test('roll week to backlog moves unfinished tasks and leaves done ones', async ({ page }) => {
	const lastWeek = weekISOs(-1);
	const seed: Record<string, string> = { 'Backlog.md': '- [ ] older backlog task\n' };
	for (const iso of lastWeek) {
		seed[`${iso}.md`] = `- [ ] leftover ${iso}\n- [x] done ${iso}\n- [>] wip task ${iso}\n`;
	}

	await openApp(page, seed);

	// Current week view: no roll button.
	await expect(page.locator('.btn-roll-week')).toHaveCount(0);

	// Navigate to last week → button appears (unfinished tasks present).
	await page.locator('.week-nav .btn-nav').first().click();
	await expect(page.locator('.btn-roll-week')).toBeVisible();

	// Roll.
	await page.locator('.btn-roll-week').click();
	await expect(page.locator('.toast')).toContainText('Rolled 14 tasks to backlog', { timeout: 3000 });

	// Button disappears once the week holds no unfinished tasks.
	await expect(page.locator('.btn-roll-week')).toHaveCount(0);

	// Backlog now contains the separator heading + moved tasks, older first.
	const backlogMd = await page.evaluate(() => (globalThis as any).__alphFs.get('Backlog.md'));
	expect(backlogMd).toContain(`## Added week of ${lastWeek[0]}`);
	for (const iso of lastWeek) expect(backlogMd).toContain(`- [ ] leftover ${iso}`);
	expect(backlogMd.indexOf('- [ ] older backlog task')).toBeLessThan(
		backlogMd.indexOf('## Added week of'),
	);

	// Done tasks stay in their daily files; unfinished ones are gone.
	for (const iso of lastWeek) {
		const dayMd = await page.evaluate(
			(name) => (globalThis as any).__alphFs.get(name),
			`${iso}.md`,
		);
		expect(dayMd).toContain(`- [x] done ${iso}`);
		expect(dayMd).not.toContain('leftover');
	}

	// The rail shows the rolled tasks alongside the older backlog task.
	const rail = page.locator('#backlog-rail');
	await expect(rail).toContainText('older backlog task');
	await expect(rail).toContainText(`leftover ${lastWeek[0]}`);

	// Bug 12.3: done and in-progress items must not appear in the backlog as
	// incomplete — done tasks stay out of the roll entirely; in-progress
	// rolled tasks must render as in-progress and keep [>] on disk.
	const backlogMdAfterRoll = await page.evaluate(() => (globalThis as any).__alphFs.get('Backlog.md'));
	expect(backlogMdAfterRoll).not.toContain('- [x] done');
	expect((backlogMdAfterRoll.match(/- \[>\] wip task/g) ?? []).length).toBe(7);
	expect(backlogMdAfterRoll).not.toContain('- [ ] wip task');
	const wipRow = page.locator('#backlog-rail .task-item').filter({ hasText: 'wip task' }).first();
	await expect(wipRow).toHaveClass(/in-progress/);
});

test('completing an overdue in-progress task moves it to today', async ({ page }) => {
	const todayISO = localISO(new Date());
	const lastWeek = weekISOs(-1);
	const pastISO = lastWeek[0]; // last week's Monday

	await openApp(page, {
		[`${pastISO}.md`]: '- [>] overdue in progress\n',
	});

	// The past-day task surfaces in the backlog rail as overdue.
	const rail = page.locator('#backlog-rail');
	await expect(rail).toContainText('Overdue');
	await expect(rail).toContainText('overdue in progress');

	// Complete it via the checkbox.
	await rail.locator('.task-item').filter({ hasText: 'overdue in progress' })
		.locator('.task-main input[type=checkbox]')
		.click();

	// It lands in today's file as done...
	const todayMd = await expect.poll(
		async () => page.evaluate((n) => (globalThis as any).__alphFs.get(n), `${todayISO}.md`),
		{ timeout: 4000 },
	).toContain('- [x] overdue in progress');

	// ...and is removed from the past day file.
	const pastMd = await page.evaluate(
		(n) => (globalThis as any).__alphFs.get(n),
		`${pastISO}.md`,
	);
	expect(pastMd ?? '').not.toContain('overdue in progress');
});

// ── Drag to backlog category (doc 12, bug 2) ─────────────────────────────────

/**
 * Simulate an HTML5 drag-and-drop with a shared DataTransfer, since
 * Playwright's mouse-based dragAndDrop does not drive native DnD.
 */
async function html5Drag(page: Page, source: ReturnType<Page['locator']>, target: ReturnType<Page['locator']>): Promise<void> {
	const sourceEl = await source.elementHandle();
	const targetEl = await target.elementHandle();
	await page.evaluate(
		([src, tgt]) => {
			const dt = new DataTransfer();
			src!.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
			tgt!.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
			tgt!.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
			tgt!.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
			src!.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
		},
		[sourceEl, targetEl],
	);
}

test('dragging a task from a day column onto a backlog category moves it (bug 12.2)', async ({ page }) => {
	const todayISO = localISO(new Date());
	await openApp(page, {
		'Backlog.md': '# PP\n- [ ] existing pp\n',
		[`${todayISO}.md`]: '# Work\n- [ ] dragged task\n',
	});

	// Drag today's task row onto the PP category header in the backlog rail.
	await html5Drag(
		page,
		page.locator('.day-col.today .task-item'),
		page.locator('#backlog-rail .section-head').first(),
	);

	// Wait for both writes (target add + source delete) to flush.
	await expect
		.poll(
			async () => page.evaluate(() => (globalThis as any).__alphFs.get('Backlog.md')),
			{ timeout: 4000 },
		)
		.toContain('dragged task');

	const backlogMd = await page.evaluate(() => (globalThis as any).__alphFs.get('Backlog.md'));
	const dayMd = await page.evaluate(
		(n) => (globalThis as any).__alphFs.get(n),
		`${todayISO}.md`,
	);

	// The task appears EXACTLY once in the backlog...
	expect((backlogMd.match(/- \[ \] dragged task/g) ?? []).length).toBe(1);
	expect(backlogMd).toContain('- [ ] existing pp');
	// ...and is gone from the day file (moved, not copied).
	expect(dayMd ?? '').not.toContain('dragged task');
	// The UI no longer shows it in the day column.
	await expect(page.locator('.day-col.today')).not.toContainText('dragged task');
	await expect(page.locator('#backlog-rail')).toContainText('dragged task');
});

test('dragging a backlog task onto a day column category moves it (bug 12.2)', async ({ page }) => {
	const todayISO = localISO(new Date());
	await openApp(page, {
		'Backlog.md': '# PP\n- [ ] dragged backlog task\n',
		[`${todayISO}.md`]: '# Work\n- [ ] existing work\n',
	});

	await html5Drag(
		page,
		page.locator('#backlog-rail .task-item'),
		page.locator('.day-col.today .section-head').first(),
	);

	await expect
		.poll(
			async () => page.evaluate((n) => (globalThis as any).__alphFs.get(n), `${todayISO}.md`),
			{ timeout: 4000 },
		)
		.toContain('dragged backlog task');

	const backlogMd = await page.evaluate(() => (globalThis as any).__alphFs.get('Backlog.md'));
	const dayMd = await page.evaluate(
		(n) => (globalThis as any).__alphFs.get(n),
		`${todayISO}.md`,
	);
	expect((dayMd.match(/dragged backlog task/g) ?? []).length).toBe(1);
	expect(backlogMd).not.toContain('dragged backlog task');
});

test('dragging a backlog task onto another backlog category moves it (bug 12.2)', async ({ page }) => {
	await openApp(page, {
		'Backlog.md': '# PP\n- [ ] pp task\n# HW\n- [ ] moved task\n',
	});

	// Drag the "moved task" row onto the PP category header.
	await html5Drag(
		page,
		page.locator('#backlog-rail .task-item').filter({ hasText: 'moved task' }),
		page.locator('#backlog-rail .section-head').filter({ hasText: 'PP' }),
	);

	await expect
		.poll(
			async () => page.evaluate(() => (globalThis as any).__alphFs.get('Backlog.md')),
			{ timeout: 4000 },
		)
		.toContain('moved task');

	const backlogMd = await page.evaluate(() => (globalThis as any).__alphFs.get('Backlog.md'));
	expect((backlogMd.match(/- \[ \] moved task/g) ?? []).length).toBe(1);
	expect(backlogMd).toContain('# PP\n- [ ] pp task\n- [ ] moved task\n# HW\n');
});
