<script lang="ts">
	import { addTask, addTaskWithCategory } from '$lib/state.svelte.js';

	let {
		filename,
		category = null,
		colonEnabled = true,
		onclose,
	}: {
		filename:      string;
		category?:      string | null;
		colonEnabled?:  boolean;
		onclose?:       () => void;
	} = $props();

	let value = $state('');
	let inputEl: HTMLInputElement;

	/** Build a raw markdown task line from terse input.
	 *  Syntax: [**]title[**] [duration]
	 *  **title** → starred; 1h / 30m / 1.5h → estimateMin suffix.
	 */
	function buildLine(raw: string): string | null {
		const text = raw.trim();
		if (!text) return null;
		const durMatch = text.match(/\s+(\d*\.?\d+\s*(?:h|m))$/i);
		const dur      = durMatch ? durMatch[0] : '';
		const title    = durMatch ? text.slice(0, durMatch.index).trim() : text;
		if (!title) return null;
		return `- [ ] ${title}${dur}`;
	}

	async function submit() {
		const raw = value.trim();
		if (!raw) return;

		// Colon shortcut: "PP: drawing" → category PP, title "drawing"
		if (colonEnabled) {
			const colonIdx = raw.indexOf(': ');
			if (colonIdx > 0) {
				const cat  = raw.slice(0, colonIdx).trim();
				const rest = raw.slice(colonIdx + 2).trim();
				const line = buildLine(rest);
				if (line && cat) {
					await addTaskWithCategory(filename, cat, line);
					value = '';
					onclose?.();
					return;
				}
			}
		}

		// Normal flow
		const line = buildLine(value);
		if (!line) return;
		await addTask(filename, line, category);
		value = '';
		onclose?.();
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
		if (e.key === 'Escape') onclose?.();
	}

	$effect(() => {
		inputEl?.focus();
	});
</script>

<div class="add-wrap">
	<input
		bind:this={inputEl}
		bind:value
		class="add-input"
		placeholder="cat: task 1h  **bold** = starred"
		onkeydown={handleKey}
	/>
	<div class="add-hint">Enter to add &middot; Esc cancel</div>
</div>

<style>
.add-wrap { padding: 6px 8px; border-top: 1px solid var(--border); }
.add-input {
	width: 100%; border: 1px solid var(--border-input); border-radius: 5px;
	padding: 5px 8px; font-size: 12px; outline: none;
	background: var(--surface); box-shadow: 0 0 0 2px #00000010;
}
.add-hint { font-size: 10px; color: var(--text-muted); margin-top: 3px; }
</style>
