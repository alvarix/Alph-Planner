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

	$effect(() => {
		textareaEl?.focus();
	});

	async function commit() {
		await saveNotes(filename, value);
		onclose?.();
	}

	function handleKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commit(); }
		if (e.key === 'Escape') { value = initialText; onclose?.(); }
	}
</script>

<div class="notes-backdrop" role="none" onclick={commit}></div>

<div class="notes-panel" role="dialog" aria-label="Daily notes">
	<div class="notes-header">Notes</div>
	<textarea
		bind:this={textareaEl}
		bind:value
		class="notes-area"
		placeholder="Free-form notes, links, ideas…"
		rows="6"
		onkeydown={handleKey}
	></textarea>
	<div class="notes-footer">
		<span class="notes-hint">Cmd+Enter or click outside to save &middot; Esc cancel</span>
		<button class="notes-save" onclick={commit}>Save</button>
	</div>
</div>

<style>
.notes-backdrop {
	position: fixed; inset: 0; z-index: 99;
}
.notes-panel {
	position: absolute; bottom: calc(100% + 4px); left: 0; right: 0;
	background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
	box-shadow: 0 4px 16px rgba(0,0,0,.12); z-index: 100;
	display: flex; flex-direction: column;
}
.notes-header {
	padding: 6px 10px 4px; font-size: 10px; font-weight: 700;
	text-transform: uppercase; letter-spacing: .5px; color: #94a3b8;
	border-bottom: 1px solid #f1f5f9;
}
.notes-area {
	width: 100%; resize: vertical; border: none; outline: none;
	padding: 8px 10px; font-size: 12px; line-height: 1.5;
	font-family: inherit; color: #1e293b; min-height: 80px;
	box-sizing: border-box;
}
.notes-footer {
	display: flex; align-items: center; gap: 8px;
	padding: 4px 8px; border-top: 1px solid #f1f5f9;
}
.notes-hint { font-size: 10px; color: #cbd5e1; flex: 1; }
.notes-save {
	font-size: 11px; padding: 3px 10px; border-radius: 4px;
	border: 1px solid #e2e8f0; background: #f8fafc;
	cursor: pointer; color: #475569;
}
.notes-save:hover { background: #e2e8f0; }
</style>
