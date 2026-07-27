import type { Handle } from "@sveltejs/kit";

/**
 * Production-only security headers.
 *
 * SvelteKit and build plugins (PWA workbox, etc.) generate inline scripts
 * that cannot be externalized. The SvelteKit nonce pipeline only covers
 * its own SSR output — Vite-transform-level injections bypass it, making
 * a nonce-based script-src unworkable in practice.
 *
 * The primary XSS defense is Svelte's compile-time auto-escaping:
 * every `{expression}` in templates is HTML-entity encoded. Zero `{@html}`
 * directives exist in this codebase. The CSP below is defense-in-depth:
 * it blocks loading of external malicious scripts, clickjacking, and
 * other post-exploitation techniques.
 */
export const handle: Handle = async ({ event, resolve }) => {
	if (import.meta.env.PROD) {
		const response = await resolve(event);

		response.headers.set(
			"Content-Security-Policy",
			[
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline'",
				"style-src 'self' 'unsafe-inline'",
				"img-src 'self' data:",
				"font-src 'self'",
				"connect-src 'self'",
				"worker-src 'self'",
				"manifest-src 'self'",
				"frame-ancestors 'none'",
				"form-action 'self'",
				"base-uri 'self'",
			].join("; "),
		);

		response.headers.set("X-Content-Type-Options", "nosniff");
		response.headers.set("X-Frame-Options", "DENY");
		response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

		return response;
	}

	return resolve(event);
};
