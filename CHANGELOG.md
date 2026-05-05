# Changelog

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
