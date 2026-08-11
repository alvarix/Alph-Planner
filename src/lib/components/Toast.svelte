<script lang="ts" module>
	let msg   = $state('');
	let error = $state(false);
	let timer = 0;

	export function toast(text: string, isError = false) {
		msg   = text;
		error = isError;
		clearTimeout(timer);
		// Warn toasts need attention — give them longer to read.
		const ms = isError ? 4500 : 2400;
		timer = setTimeout(() => { msg = ''; }, ms) as unknown as number;
	}
</script>

{#if msg}
	<div class="toast" class:err={error}>{msg}</div>
{/if}

<style>
.toast {
	position: fixed; bottom: 20px; left: 50%;
	transform: translateX(-50%);
	background: var(--bar-bg); color: var(--bar-text);
	padding: 8px 18px; border-radius: 6px;
	font-size: 12px; font-weight: 500; z-index: 300;
	pointer-events: none;
}
.toast.err { background: var(--error-bg); }
</style>
