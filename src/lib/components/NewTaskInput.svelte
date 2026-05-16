<script lang="ts">
	import { addTask } from '$lib/state.svelte.js';

	let {
		filename,
		category = null,
		onclose,
	}: {
		filename:  string;
		category?: string | null;
		onclose?:  () => void;
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
		placeholder="task title 1h  **bold** = starred"
		onkeydown={handleKey}
	/>
	<div class="add-hint">Enter to add &middot; Esc cancel</div>
</div>

<style>
.add-wrap { padding: 6px 8px; border-top: 1px solid #dddad5; }
.add-input {
	width: 100%; border: 1px solid #8a8680; border-radius: 5px;
	padding: 5px 8px; font-size: 12px; outline: none;
	background: #fff; box-shadow: 0 0 0 2px #00000010;
}
.add-hint { font-size: 10px; color: #8a8680; margin-top: 3px; }
</style>
