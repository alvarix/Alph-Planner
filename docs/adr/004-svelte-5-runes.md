# ADR 004: Svelte 5 Runes for State Management

## Status

Accepted

## Context

The app needs reactive state management to re-render when the file cache changes. Options considered:

1. **Svelte 4 stores** (`writable`, `readable`, `derived`) — the prior Svelte approach
2. **Svelte 5 runes** (`$state`, `$derived`, `$effect`) — Svelte 5's new reactive primitives
3. **External state library** (Pinia, Zustand, Redux, Jotai) — framework-agnostic stores
4. **Plain reactive variables** in components — no shared state

## Decision

Use **Svelte 5 runes** exclusively. All shared app state lives in `lib/state.svelte.ts` as a single `$state` object (`appState`). Mutations are plain functions that modify the state object; Svelte's reactivity propagates changes to all components automatically.

## Consequences

**Positive:**
- No subscription boilerplate — components read `appState.cache` directly, no `$store` syntax
- Fine-grained reactivity — only components that read a changed field re-render
- State mutations are plain imperative functions — easy to read, test, and trace
- No framework lock-in beyond Svelte itself

**Negative:**
- Svelte 5 runes are a breaking change from Svelte 4 — `export let`, `$:`, and stores cannot be mixed with runes in the same file
- Runes mode was relatively new at the time of adoption — some ecosystem tooling had rough edges
- The single `appState` object could become a bottleneck if the app grows significantly

## Tradeoffs

- Svelte 4 stores are still functional but deprecated in Svelte 5 — using them would create a migration burden later
- An external state library (Pinia, Zustand) would decouple state from the framework but adds an unnecessary dependency for an app this size
- Component-local state only would require prop-drilling across DayColumn, BacklogRail, and TaskRow — impractical given the shared mutation surface

## Implementation Notes

- `lib/state.svelte.ts` — the single state module; exports `appState` and all action functions
- All files importing state use: `import { appState, toggleTask, ... } from '$lib/state.svelte'`
- Component-local UI state (editing mode, popover open) uses `$state()` inline — not promoted to `appState`
- The `.svelte.ts` extension signals to the Svelte compiler that this file uses runes
