// This app is fully client-side (state lives in localStorage).
// SSR would render empty state on the server, then hydrate with real data
// on the client, causing a Svelte hydration mismatch that blanks the page.
export const ssr = false;
