# Changelog

## [0.3.0] - 2026-05-05

### Fixed
- Blank page on load: `structuredClone` cannot clone Svelte 5 `$state` Proxies;
  replaced all three call-sites in ConfigDrawer with `$state.snapshot()`
- `vite-plugin-pwa@1.2.0` peer dep conflict with Vite 8; bumped to 1.3.0
- Removed `engine-strict=true` from `.npmrc` (Node 24 caused false rejections)

### Added
- Playwright test suite (`tests/app.test.ts`) — 7 smoke tests covering load,
  task input, scheduling, config drawer, and localStorage persistence
- `docs/testing.md` — plain-English guide to running and writing tests
- `playwright.config.ts` with auto-start dev server

## [0.2.0] - 2026-05-05

### Added
- Week weather overview: day headers show emoji + forecast high temp via Open-Meteo (free, no API key); uses browser geolocation with silent fallback on deny or network failure
- `docs/features.md`: plain-English feature reference, updated with each change

## [0.1.0] - 2026-05-05

### Added
- Task input with terse syntax parser (title, duration, xN sessions, pN priority)
- Greedy priority-first weekly scheduler
- Draggable week grid with 30-min slots
- Unscheduled overflow rail with roll-to-next-week
- Config drawer: per-day hour caps, weekends toggle, block-offs (recurring + one-off)
- localStorage persistence with JSON export/import
- Mobile layout with bottom tab navigation
- PWA manifest and service worker
- Vercel deployment
