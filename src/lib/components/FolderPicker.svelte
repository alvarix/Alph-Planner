<script lang="ts">
	import { pickFolder, requestPermission } from '$lib/fs/folder.js';
	import { appState, refresh, forgetAndResetFolder } from '$lib/state.svelte.js';

	/** True while an async folder operation is in flight. */
	let busy = $state(false);

	async function choose() {
		if (busy) return;
		busy = true;
		try {
			const result = await pickFolder();
			appState.folder = result;
			if (result.status === 'ready') await refresh();
		} finally {
			busy = false;
		}
	}

	async function grant() {
		if (busy || appState.folder.status !== 'needs-permission') return;
		busy = true;
		try {
			const result = await requestPermission(appState.folder.handle);
			appState.folder = result;
			if (result.status === 'ready') await refresh();
		} finally {
			busy = false;
		}
	}

	/** Clear the stored handle and start fresh. Breaks the re-prompt loop. */
	async function forget() {
		if (busy) return;
		busy = true;
		try {
			await forgetAndResetFolder();
		} finally {
			busy = false;
		}
	}

	/** Retry refresh — useful for transient iCloud locks that resolved. */
	async function retryRefresh() {
		if (busy || appState.folder.status !== 'needs-permission') return;
		busy = true;
		try {
			appState.refreshFailCount = 0;
			appState.lastRefreshError = null;
			const handle = appState.folder.handle;
			const result = await requestPermission(handle);
			appState.folder = result;
			if (result.status === 'ready') await refresh();
		} finally {
			busy = false;
		}
	}

	const errorReason = $derived(
		appState.folder.status === 'needs-permission' ? appState.folder.errorReason : null,
	);

	/** Recovery instructions per error reason. */
	const recoveryHint = $derived(
		errorReason === 'icloud-locked'
			? 'Chrome cannot write to iCloud Drive folders. Move your .md files to a local folder (e.g. ~/Documents/alph-planner) and pick that folder instead.'
			: errorReason === 'permission-denied'
				? 'Permission was denied. Click Re-grant below to allow access, or pick a different folder.'
				: errorReason === 'stale-handle'
					? 'The stored folder handle is from an older version. Click "Forget folder" to clear it, then pick your folder again.'
					: appState.refreshFailCount >= 3
						? 'Refresh has failed repeatedly. Your files may be on iCloud Drive or temporarily locked. Wait a moment and try Retry, or Forget folder to start fresh.'
						: '',
	);
</script>

<div class="overlay">
	<div class="card">
		<h2>Choose your daily folder</h2>
		<p>
			Point Alph-Planner at the folder where your daily Markdown files live —
			one file per day, named <code>YYYY-MM-DD.md</code>, plus
			<code>Backlog.md</code> for your running task list.
		</p>

		{#if appState.folder.status === 'needs-permission'}
			<p class="hint">
				Previously used <strong>{appState.folder.name}</strong>.
				{#if errorReason}
					<br /><span class="error-reason">{errorReason}</span>
				{/if}
			</p>
			{#if recoveryHint}
				<p class="recovery">{recoveryHint}</p>
			{/if}
			<div class="actions">
				<button class="btn-primary" onclick={grant} disabled={busy}>
					{busy ? 'Working&hellip;' : 'Re-grant access'}
				</button>
				<button class="btn-secondary" onclick={retryRefresh} disabled={busy}>
					Retry
				</button>
			</div>
			<button class="btn-danger" onclick={forget} disabled={busy}>
				Forget folder &amp; start fresh
			</button>
		{:else}
			<button class="btn-primary" onclick={choose} disabled={busy}>
				{busy ? 'Working&hellip;' : 'Choose folder&hellip;'}
			</button>
		{/if}

		{#if appState.folder.status === 'error'}
			<p class="error">{appState.folder.message}</p>
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
	max-width: 400px; width: 90%;
	box-shadow: 0 8px 24px rgba(0,0,0,.07);
}
h2 { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
p  { font-size: 13px; color: #94a3b8; line-height: 1.65; margin-bottom: 20px; }
code { font-family: monospace; font-size: 11px; background: #f8fafc; padding: 2px 6px; border-radius: 4px; }
.hint  { color: #475569; }
.error { color: #dc2626; font-size: 12px; margin-top: 8px; margin-bottom: 0; }
.error-reason { font-size: 11px; color: #94a3b8; font-family: monospace; }
.recovery {
	font-size: 12px; color: #b45309; line-height: 1.55;
	background: #fffbeb; border: 1px solid #fde68a;
	border-radius: 6px; padding: 10px 12px; margin-bottom: 16px;
	text-align: left;
}
.actions {
	display: flex; gap: 8px; margin-bottom: 10px;
}
.actions .btn-primary { flex: 1; }
.btn-primary {
	display: block; width: 100%; padding: 11px;
	font-size: 13px; font-weight: 600;
	background: #1e293b; color: #fff;
	border: none; border-radius: 7px; cursor: pointer;
}
.btn-primary:hover:not(:disabled) { background: #334155; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
	display: block; padding: 11px 16px;
	font-size: 13px; font-weight: 500;
	background: #fff; color: #1e293b;
	border: 1px solid #e2e8f0; border-radius: 7px; cursor: pointer;
}
.btn-secondary:hover:not(:disabled) { background: #f8fafc; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger {
	display: block; width: 100%; padding: 11px;
	font-size: 12px; font-weight: 500;
	background: none; color: #dc2626;
	border: 1px solid #fecaca; border-radius: 7px; cursor: pointer;
	margin-top: 4px;
}
.btn-danger:hover:not(:disabled) { background: #fef2f2; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
