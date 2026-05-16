<script lang="ts">
	import { saveNotes } from '$lib/state.svelte.js';

	let {
		filename,
		initialText,
		onclose,
	}: {
		filename:    string;
		initialText: string;
		onclose?:    () => void;
	} = $props();

	let value    = $state(initialText);
	let textareaEl: HTMLTextAreaElement;

	$effect(() => { textareaEl?.focus(); });

	async function commit() {
		await saveNotes(filename, value);
		onclose?.();
	}

	function handleKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commit(); }
		if (e.key === 'Escape') { value = initialText; onclose?.(); }
	}
</script>

<div class="notes-panel" role="region" aria-label="Daily notes">
	<div class="notes-header">
		<span>Notes</span>
		<button class="notes-close" onclick={() => { value = initialText; onclose?.(); }} aria-label="Close notes">&#x2715;</button>
	</div>
	<textarea
		bind:this={textareaEl}
		bind:value
		class="notes-area"
		placeholder="Free-form notes, links, ideas…"
		onkeydown={handleKey}
	></textarea>
	<div class="notes-footer">
		<span class="notes-hint">Cmd+Enter to save &middot; Esc cancel</span>
		<button class="notes-save" onclick={commit}>Save</button>
	</div>
</div>

<style>
.notes-panel {
	display: flex; flex-direction: column; flex: 1; overflow: hidden;
	background: #fff;
}
.notes-header {
	display: flex; align-items: center;
	padding: 6px 10px 4px; font-size: 10px; font-weight: 700;
	text-transform: uppercase; letter-spacing: .5px; color: #8a8680;
	border-bottom: 1px solid #dddad5; flex-shrink: 0;
}
.notes-header span { flex: 1; }
.notes-close {
	background: none; border: none; cursor: pointer;
	color: #c0bab4; font-size: 11px; padding: 0 2px; line-height: 1;
	transition: color .1s;
}
.notes-close:hover { color: #6a6560; }
.notes-area {
	flex: 1; resize: none; border: none; outline: none;
	padding: 8px 10px; font-size: 12px; line-height: 1.5;
	font-family: inherit; color: #1c1c1b;
	box-sizing: border-box; background: transparent;
}
.notes-footer {
	display: flex; align-items: center; gap: 8px;
	padding: 4px 8px; border-top: 1px solid #dddad5; flex-shrink: 0;
}
.notes-hint { font-size: 10px; color: #c0bab4; flex: 1; }
.notes-save {
	font-size: 11px; padding: 3px 10px; border-radius: 4px;
	border: 1px solid #dddad5; background: #f4f3f1;
	cursor: pointer; color: #555;
}
.notes-save:hover { background: #eeece8; }
</style>
