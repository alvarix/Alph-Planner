import type { Handle } from '@sveltejs/kit';

/**
 * Production-only security headers: CSP + common hardening.
 *
 * Deliberately NOT applied in dev mode because Vite's HMR relies on
 * WebSocket connections and inline script injection that a strict
 * CSP would block, making development impossible.
 *
 * CSP is defense-in-depth here — all rendering uses Svelte's
 * auto-escaping ({expression} interpolation), so there is no known
 * XSS vector. These headers ensure that if a future change or
 * compromised dependency introduces one, the browser will refuse
 * to execute injected scripts, fetch exfiltrating URLs, or frame
 * the page.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Do not break Vite dev (HMR needs inline scripts + cross-origin WS).
	if (import.meta.env.PROD) {
		response.headers.set(
			'Content-Security-Policy',
			[
				"default-src 'self'",
				"style-src 'self' 'unsafe-inline'", // Svelte scoped <style> blocks
				"script-src 'self'",
				"img-src 'self' data:",
				"font-src 'self'",
				"connect-src 'self'",
				"worker-src 'self'", // PWA service worker
				"manifest-src 'self'",
				"frame-ancestors 'none'", // prevent clickjacking
				"form-action 'self'",
				"base-uri 'self'",
			].join('; '),
		);

		response.headers.set('X-Content-Type-Options', 'nosniff');
		response.headers.set('X-Frame-Options', 'DENY');
		response.headers.set(
			'Referrer-Policy',
			'strict-origin-when-cross-origin',
		);
	}

	return response;
};
