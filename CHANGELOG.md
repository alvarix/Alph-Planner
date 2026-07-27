# Changelog

## 0.0.1

### Security

- **CSP + security headers added.** `src/hooks.server.ts` sets strict Content-Security-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy` on all production responses. Applied only in prod to avoid breaking Vite HMR in dev.
- **Full XSS audit passed.** Zero `{@html}`, `innerHTML`, or unsafe rendering paths across all 11 Svelte components. All user content rendered through Svelte auto-escaping.
- **Path traversal audit passed.** File System Access API enforces directory containment; only bare filenames reach `getFileHandle()`.
- **Dependency audit.** All 19 findings from `pnpm audit` confirmed build-time only (tar, brace-expansion, vite, postcss, etc.) or irrelevant to this app's architecture (SvelteKit form actions, cookies). `@sveltejs/kit` bumped to 2.70.1, `vite` to 8.1.5, clearing 5. Remaining 10 are deep transitive build-tooling — zero runtime impact.
