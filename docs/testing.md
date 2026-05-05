# Testing

Tests use [Playwright](https://playwright.dev/) and run against the live dev server.

## Run tests

```bash
npm test            # headless, list reporter
npm run test:ui     # Playwright UI — step through tests visually
```

The dev server starts automatically on port 5199 if it isn't already running.

## Test file

`tests/app.test.ts` — 7 smoke tests covering the main user paths.

## What each test checks

### page loads and shows main UI
Opens `/`, waits for the app to mount (CSR-only, so we wait for `#topbar`), then
confirms the heading and all three panels (Inbox, grid, Overflow) are visible.
Also asserts zero JS exceptions during load — this was the test that caught the
`structuredClone` crash that was causing the blank page.

### task input parses and adds a task
Types `write tests 1h, p2` in the textarea, presses Cmd+Enter, and confirms the
task title appears in the task list. Verifies the parser accepts valid syntax.

### auto-schedule places task on the grid
Adds a task via the Add button and checks that at least one `.sess` block appears
in the week grid. Confirms the scheduler runs and renders output.

### invalid input does not add a task
Types a line with no duration token, clicks Add, and confirms the task list count
didn't change. Verifies the parser rejects bad input silently.

### p1 task lands before p3 task on the grid
Clears localStorage, reloads, adds a p3 and a p1 task together, then checks that
the first rendered session block contains the p1 task title. Verifies priority
ordering in the scheduler.

### config drawer opens and closes
Clicks the ⚙ gear button, confirms the drawer has the `open` class, then clicks ✕
and confirms it's gone. Basic drawer interaction smoke test.

### task survives a page reload
Adds a task, reloads the page, and confirms the task is still in the list.
Verifies localStorage persistence is wired up correctly.

### markdown: imports unchecked tasks, skips headers and done items
Pastes a multi-section Markdown task list, clicks Add, and asserts the correct
items appear (with duration) while headings, checked items, and no-duration lines
are absent from the task list.

### markdown: attached xN (1hx2) produces correct session count
Submits `- [ ] Court prep 1hx2 p1` and checks that 2 session blocks appear on
the grid, confirming the attached-xN parser path works.

### markdown: bare decimal duration (.5 with no h) is treated as hours
Submits `- [ ] Motel tax .5 p1` and checks the duration badge shows `30m`
(0.5 h = 30 min), confirming the bare-decimal fallback works.

## Adding tests

Each test should:
1. Call `localStorage.clear()` + reload if it needs a clean state (tests share a browser but not localStorage across page loads)
2. `waitForSelector('#topbar')` after every `goto` or `reload` — this is the signal that the Svelte app has mounted
3. Prefer text/role selectors over CSS classes where possible for resilience

## CI

Add this step to a GitHub Actions workflow:

```yaml
- run: npx playwright install --with-deps chromium
- run: npm test
```
