# Deployment

## Hosting: Vercel

The app is deployed to Vercel using `@sveltejs/adapter-vercel`. SvelteKit's SSR adapter generates serverless functions for the initial page load.

**No API routes are used.** The Vercel deployment serves only the app shell. All data operations happen client-side via the File System Access API.

### Build

```bash
pnpm build
```

Output: `.vercel/output/` (serverless functions + static assets)

### Deploy

Vercel auto-deploys on push to `main` (assumed — no CI config was found in the repo).

## PWA

Configured via `vite-plugin-pwa` in `vite.config.ts`.

- **Strategy**: Auto-update service worker (updates silently in background)
- **Cached assets**: JS, CSS, icons, fonts (`globPatterns`)
- **`navigateFallback: null`**: SSR is active; no cached fallback HTML
- **Manifest**: `theme_color: #111`, `background_color: #111`
- **Install prompt**: Appears in Chrome address bar on supported platforms

PWA icons: `src/lib/assets/` (192px and 512px).

## Local / Self-Hosted

For persistent local access (e.g., on a home machine):

```bash
pnpm build
pm2 start "pnpm exec vite preview --port 5177" --name alph-planner
pm2 save
pm2 startup
```

This runs the production build on port 5177. File System Access API works over `localhost` without HTTPS.

## Development

```bash
pnpm dev   # starts on localhost:5173
```

PWA install prompt does not appear in dev mode.

## Browser Requirements

**Chromium only** (Chrome, Edge, Arc, Brave). The File System Access API is not available in Safari or Firefox. This is a hard constraint, not a gap to polyfill.

## Environment Variables

None required. The app has no secrets, API keys, or server-side configuration.

## Constraints

- HTTPS is required for PWA install and for File System Access API on non-localhost origins
- Vercel's free tier is sufficient — there are no serverless function invocations beyond page loads
- No database migrations, no seed data, no environment parity concerns
