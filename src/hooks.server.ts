import type { Handle } from "@sveltejs/kit";

/**
 * Production-only security headers: CSP with per-request nonces + common hardening.
 *
 * SvelteKit injects inline scripts for client-side hydration and routing.
 * These cannot be externalized, so we use a per-request cryptographic nonce
 * rather than allowing unrestricted 'unsafe-inline'.
 *
 * Dev mode is deliberately excluded — Vite's HMR uses WebSocket connections
 * and inline script injection that a strict CSP would block.
 */
export const handle: Handle = async ({ event, resolve }) => {
	// Only apply security headers in production (Vite HMR breaks in dev).
	if (import.meta.env.PROD) {
		// Per-request nonce — SvelteKit applies it to all inline <script>
		// and <style> elements it generates via the %sveltekit.nonce% marker
		// in app.html. This allows SvelteKit's own bootstrap scripts while
		// blocking any XSS-injected inline script that lacks the nonce.
		const nonce = crypto.randomUUID();

		event.locals.nonce = nonce;

		const response = await resolve(event);

		response.headers.set(
			"Content-Security-Policy",
			[
				`default-src 'self'`,
				`script-src 'self' 'nonce-${nonce}'`,
				`style-src 'self' 'unsafe-inline' 'nonce-${nonce}'`, // Svelte scoped styles need unsafe-inline (nonce covers others)
				`img-src 'self' data:`,
				`font-src 'self'`,
				`connect-src 'self'`,
				`worker-src 'self'`, // PWA service worker
				`manifest-src 'self'`,
				`frame-ancestors 'none'`,
				`form-action 'self'`,
				`base-uri 'self'`,
			].join("; "),
		);

		response.headers.set("X-Content-Type-Options", "nosniff");
		response.headers.set("X-Frame-Options", "DENY");
		response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

		return response;
	}

	// Dev: no headers, passthrough.
	const response = await resolve(event);
	return response;
};
