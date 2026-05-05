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

test('invalid input does not add a task', async ({ page }) => {
	await page.goto('/');
	await page.waitForSelector('#topbar');

	const before = await page.locator('.task-row').count();
	await page.fill('#task-input', 'no duration here');
	await page.click('button.btn-add');

	// Task list should not grow
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
