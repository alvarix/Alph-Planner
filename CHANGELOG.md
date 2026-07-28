# Changelog

## 0.0.1

### Security

- **CSP + security headers added.** `src/hooks.server.ts` sets Content-Security-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy` on all production responses. Dev mode bypassed to keep Vite HMR working. Nonce-based CSP was attempted but blocked by Vite-plugin PWA injecting inline scripts outside SvelteKit's nonce pipeline. The final CSP uses `'unsafe-inline'` for scripts and styles (safe because Svelte auto-escapes all `{expression}` content and zero `{@html}` directives exist) while locking down all external origins, framing, and form actions.
- **Full XSS audit passed.** Zero `{@html}`, `innerHTML`, or unsafe rendering paths across all 11 Svelte components. All user content rendered through Svelte auto-escaping.
- **Path traversal audit passed.** File System Access API enforces directory containment; only bare filenames reach `getFileHandle()`.
- **Dependency audit.** All 19 findings from `pnpm audit` confirmed build-time only (tar, brace-expansion, vite, postcss, etc.) or irrelevant to this app's architecture (SvelteKit form actions, cookies). `@sveltejs/kit` bumped to 2.70.1, `vite` to 8.1.5, clearing 5. Remaining 10 are deep transitive build-tooling — zero runtime impact. PWA inline registration disabled (`injectRegister: null`) to reduce inline script surface.

- **Backlog parent checkbox now cycles through in-progress.** Clicking the checkbox on a backlog task with subtasks first sets `[-]` in-progress; second click completes and moves to today.

- **Subtasks auto-propagate to parent.** Checking any subtask moves the parent to in-progress. Checking the last remaining subtask auto-completes the parent (backlog: auto-moves checked block to today). Unchecking reverses the cascade.

- **`pnpm start` script added.** Builds the production bundle then serves it locally via `vite preview`.
