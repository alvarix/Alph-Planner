import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	timeout: 10_000,
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',

	use: {
		baseURL: 'http://localhost:5199',
		trace: 'on-first-retry',
	},

	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
	],

	// Start the dev server automatically before tests run.
	webServer: {
		command: 'npm run dev -- --port 5199',
		url: 'http://localhost:5199',
		reuseExistingServer: true,
		timeout: 15_000,
	},
});
