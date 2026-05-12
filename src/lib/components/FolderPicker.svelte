<script lang="ts">
	import { pickFolder, requestPermission } from '$lib/fs/folder.js';
	import { state, refresh } from '$lib/state.svelte.js';

	async function choose() {
		const result = await pickFolder();
		state.folder = result;
		if (result.status === 'ready') await refresh();
	}

	async function grant() {
		if (state.folder.status !== 'needs-permission') return;
		const result = await requestPermission(state.folder.handle);
		state.folder = result;
		if (result.status === 'ready') await refresh();
	}
</script>

<div class="overlay">
	<div class="card">
		<h2>Choose your daily folder</h2>
		<p>
			Point Alph-Planner at the folder where your daily Markdown files live —
			one file per day, named <code>YYYY-MM-DD.md</code>, plus
			<code>Backlog.md</code> for your running task list.
		</p>

		{#if state.folder.status === 'needs-permission'}
			<p class="hint">
				Previously used <strong>{state.folder.name}</strong>. Re-grant access to continue.
			</p>
			<button class="btn-primary" onclick={grant}>Re-grant access</button>
		{:else}
			<button class="btn-primary" onclick={choose}>Choose folder&hellip;</button>
		{/if}

		{#if state.folder.status === 'error'}
			<p class="error">{state.folder.message}</p>
		{/if}
	</div>
</div>

<style>
.overlay {
	position: fixed; inset: 0;
	background: rgba(248,250,252,.96);
	display: flex; align-items: center; justify-content: center;
	z-index: 100;
}
.card {
	background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
	padding: 32px 36px; text-align: center;
	max-width: 360px; width: 90%;
	box-shadow: 0 8px 24px rgba(0,0,0,.07);
}
h2 { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
p  { font-size: 13px; color: #94a3b8; line-height: 1.65; margin-bottom: 20px; }
code { font-family: monospace; font-size: 11px; background: #f8fafc; padding: 2px 6px; border-radius: 4px; }
.hint  { color: #475569; }
.error { color: #dc2626; font-size: 12px; margin-top: 8px; margin-bottom: 0; }
.btn-primary {
	display: block; width: 100%; padding: 11px;
	font-size: 13px; font-weight: 600;
	background: #1e293b; color: #fff;
	border: none; border-radius: 7px; cursor: pointer;
}
.btn-primary:hover { background: #334155; }
</style>
