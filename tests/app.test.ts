import { test, expect } from '@playwright/test';

// ── Smoke ──────────────────────────────────────────────────────────────────

test('page loads and shows main UI', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', e => errors.push(e.message));

	await page.goto('/');

	// Wait for the SvelteKit client to mount (CSR-only app)
	await page.waitForSelector('#topbar', { timeout: 8000 });

	// Heading visible
	await expect(page.locator('h1')).toHaveText('Alph-Planner');

	// Three panels rendered
	await expect(page.locator('#inbox')).toBeVisible();
	await expect(page.locator('#grid-container')).toBeVisible();
	await expect(page.locator('#unscheduled')).toBeVisible();

	// No JS exceptions during load
	expect(errors).toHaveLength(0);
});

// ── Task input ─────────────────────────────────────────────────────────────

test('task input parses and adds a task', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');

	await page.fill('#task-input', 'write tests 1h, p2');
	await page.keyboard.press('Meta+Enter');

	// Task appears in the task list
	await expect(page.locator('#task-list')).toContainText('write tests');
});

test('auto-schedule places task on the grid', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');

	await page.fill('#task-input', 'grid task .5h, p1');
	await page.click('button.btn-add');

	// A session block should appear in the week grid
	await expect(page.locator('.sess').first()).toBeVisible();
	await expect(page.locator('.sess').first()).toContainText('grid task');
});

test('task with no duration gets 30m default', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await page.waitForSelector('#topbar');

	await page.fill('#task-input', 'buy milk');
	await page.click('button.btn-add');

	await expect(page.locator('#task-list')).toContainText('buy milk');
	await expect(page.locator('.t-dur')).toContainText('30m');
});

test('truly empty input does not add a task', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');

	const before = await page.locator('.task-row').count();
	await page.fill('#task-input', '   ');
	await page.click('button.btn-add');
	expect(await page.locator('.task-row').count()).toBe(before);
});

// ── Scheduler ──────────────────────────────────────────────────────────────

test('p1 task lands before p3 task on the grid', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');

	// Clear any saved state so we start fresh
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await page.waitForSelector('#topbar');

	await page.fill('#task-input', 'low priority 1h, p3\nhigh priority 1h, p1');
	await page.click('button.btn-add');

	const blocks = page.locator('.sess');
	await expect(blocks.first()).toContainText('high priority');
});

// ── Config drawer ──────────────────────────────────────────────────────────

test('config drawer opens and closes', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');

	// Drawer hidden initially
	await expect(page.locator('#cfg-drawer')).not.toHaveClass(/open/);

	// Open via gear button
	await page.click('button[title="Config"]');
	await expect(page.locator('#cfg-drawer')).toHaveClass(/open/);

	// Close via ✕
	await page.click('.cfg-close');
	await expect(page.locator('#cfg-drawer')).not.toHaveClass(/open/);
});

// ── Persistence ────────────────────────────────────────────────────────────

test('task survives a page reload', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');

	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await page.waitForSelector('#topbar');

	await page.fill('#task-input', 'persistent task 1h, p1');
	await page.click('button.btn-add');
	await expect(page.locator('#task-list')).toContainText('persistent task');

	await page.reload();
	await page.waitForSelector('#topbar');

	// Task must still be there after reload
	await expect(page.locator('#task-list')).toContainText('persistent task');
});

// ── Config persistence ─────────────────────────────────────────────────────

test('config: removing lunch blockoff updates grid and survives reload', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await page.waitForSelector('#topbar');

	// Lunch blockoff should be visible before any change
	await expect(page.locator('.blockoff').first()).toBeVisible();

	// Open config, delete lunch, apply
	await page.click('button[title="Config"]');
	await expect(page.locator('#cfg-drawer')).toHaveClass(/open/);
	await page.locator('.bo-row').filter({ hasText: 'lunch' }).locator('.bo-del').click();
	await expect(page.locator('.bo-row')).toHaveCount(0); // lunch was the only blockoff
	await page.click('.btn-apply');

	// Grid should immediately show no lunch blockoff
	await expect(page.locator('.blockoff').filter({ hasText: 'lunch' })).toHaveCount(0);

	// After reload: still gone
	await page.reload();
	await page.waitForSelector('#topbar');
	await expect(page.locator('.blockoff').filter({ hasText: 'lunch' })).toHaveCount(0);
});

test('config: re-adding lunch at a new time persists across reload', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await page.waitForSelector('#topbar');

	// Open config, delete lunch, add it back at 13:00–14:00
	await page.click('button[title="Config"]');
	await page.locator('.bo-row').filter({ hasText: 'lunch' }).locator('.bo-del').click();

	await page.fill('#bo-label', 'lunch');
	await page.selectOption('#bo-day',   'weekday');
	await page.selectOption('#bo-start', '13:00');
	await page.selectOption('#bo-end',   '14:00');
	await page.click('.btn-add-bo');

	// Drawer shows new lunch row
	await expect(page.locator('.bo-row')).toContainText('13:00');
	await page.click('.btn-apply');

	// Grid: new slot visible, old slot gone
	// slot 8 = 13:00 (9am base + 8*30min), slot 6 = 12:00
	const newLunch = page.locator('.blockoff').filter({ hasText: 'lunch' }).first();
	await expect(newLunch).toBeVisible();
	const top = await newLunch.evaluate(el => parseInt((el as HTMLElement).style.top));
	expect(top).toBe(8 * 40); // slot 8 × 40px per slot

	// After reload: new time still correct
	await page.reload();
	await page.waitForSelector('#topbar');
	const reloadedTop = await page.locator('.blockoff').filter({ hasText: 'lunch' }).first()
		.evaluate(el => parseInt((el as HTMLElement).style.top));
	expect(reloadedTop).toBe(8 * 40);
});

// ── Markdown import ────────────────────────────────────────────────────────

const MD_SAMPLE = `# 05/05/26

- [ ] alph-planner
- [ ] Dixie drawing 1h p2
- [x] already done 1h p1
- [ ] Court prep 1hx2 p1

## Mtk
- [ ] Motel tax .5 p1
- [ ] Mow 1h p1
`;

test('markdown: imports unchecked tasks, skips headers and done items', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await page.waitForSelector('#topbar');

	await page.fill('#task-input', MD_SAMPLE);
	await page.click('button.btn-add');

	const list = page.locator('#task-list');

	// Parsed items
	await expect(list).toContainText('Dixie drawing');
	await expect(list).toContainText('Court prep');
	await expect(list).toContainText('Motel tax');
	await expect(list).toContainText('Mow');

	// No duration → imported with 30m default
	await expect(list).toContainText('alph-planner');
	// Skipped: checked item
	await expect(list).not.toContainText('already done');
	// Skipped: heading text
	await expect(list).not.toContainText('05/05/26');
	await expect(list).not.toContainText('Mtk');
});

test('markdown: attached xN (1hx2) produces correct session count', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await page.waitForSelector('#topbar');

	await page.fill('#task-input', '- [ ] Court prep 1hx2 p1');
	await page.click('button.btn-add');

	// Two session blocks should appear on the grid (sessionsTotal = 2)
	await expect(page.locator('.sess')).toHaveCount(2);
});

test('markdown: bare decimal duration (.5 with no h) is treated as hours', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await page.waitForSelector('#topbar');

	await page.fill('#task-input', '- [ ] Motel tax .5 p1');
	await page.click('button.btn-add');

	// Duration should display as 30m (0.5h)
	await expect(page.locator('.t-dur')).toContainText('30m');
});
