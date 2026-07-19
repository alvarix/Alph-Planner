<script lang="ts">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { getWeekDays, weekRangeLabel } from '$lib/dates.js';
	import { restoreFolder, pickFolder, forgetFolder } from '$lib/fs/folder.js';
	import { appState, refresh, tasksForFile, backlogTasks, overdueTasks, doneTasksByDate, folderReady, forgetAndResetFolder } from '$lib/state.svelte.js';
	import type { Task } from '$lib/types.js';
	import FolderPicker from '$lib/components/FolderPicker.svelte';
	import DayColumn from '$lib/components/DayColumn.svelte';
	import BacklogRail from '$lib/components/BacklogRail.svelte';
	import DoneLog from '$lib/components/DoneLog.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { toast } from '$lib/components/Toast.svelte';

	const weekDays  = $derived(getWeekDays(appState.weekOffset));
	const weekLabel = $derived(weekRangeLabel(appState.weekOffset));

	// todayISO is always real today regardless of which week is displayed.
	const todayISO = getWeekDays(0).find(d => d.today)?.iso ?? getWeekDays(0)[0].iso;

	let draggingTask: Task | null  = $state(null);
	let doneLogOpen               = $state(false);
	// Incrementing triggers the today column to open its add input.
	let todayAddSignal            = $state(0);
	// Guard against concurrent refresh calls (focus fires repeatedly on tab-switch).
	let isRefreshing               = $state(false);

	let hidePast = $state(localStorage.getItem('hidePast') === 'true');
	let colonCatEnabled = $state(localStorage.getItem('colonCatEnabled') !== 'false');
	const visibleDays = $derived(hidePast ? weekDays.filter(d => !d.past) : weekDays);

	$effect(() => { localStorage.setItem('hidePast', String(hidePast)); });
	$effect(() => { localStorage.setItem('colonCatEnabled', String(colonCatEnabled)); });

	function shiftWeek(dir: -1 | 0 | 1) {
		if (dir === 0) appState.weekOffset = 0;
		else appState.weekOffset += dir;
	}

	// Surface FS errors as toasts.
	$effect(() => {
		if (appState.lastError) {
			toast(appState.lastError, true);
			appState.lastError = null;
		}
	});

	onMount(async () => {
		const restored = await restoreFolder();
		appState.folder = restored;
		if (restored.status === 'ready') await refresh();
	});

	/**
	 * Re-check FSAA permission on every window focus.
	 * queryPermission() does not require a user gesture, so this is safe.
	 * The isRefreshing guard prevents concurrent calls on rapid tab-switching.
	 * Does NOT overwrite a needs-permission state — the user must reconnect explicitly.
	 */
	async function handleFocus() {
		if (isRefreshing || appState.folder.status === 'needs-permission') return;
		isRefreshing = true;
		try {
			const state = await restoreFolder();
			appState.folder = state;
			if (state.status === 'ready') await refresh();
		} finally {
			isRefreshing = false;
		}
	}

	/** Explicitly re-read all files from disk. Safe to call from a button. */
	async function manualRefresh() {
		if (isRefreshing) return;
		isRefreshing = true;
		try {
			await refresh();
		} finally {
			isRefreshing = false;
		}
	}

	/**
	 * Open the native folder picker so the user can reselect or reconnect
	 * their daily folder. Probes the handle before showing the grid — if the
	 * probe fails (iCloud Drive / stale PWA), keeps the button visible and
	 * shows an actionable error toast instead of flashing a blank grid.
	 */
	async function changeFolder() {
		const result = await pickFolder();
		if (result.status !== 'ready') {
			appState.folder = result;
			return;
		}
		const handle = result.handle;

		// Probe: create + delete a temp file to verify the handle is actually
		// usable. Chrome may throw NoModificationAllowedError here when the
		// folder lives on iCloud Drive or when the PWA handle is stale.
		let probeOk = false;
		const probeName = `_alph_probe_${Date.now()}.tmp`;
		try {
			await handle.getFileHandle(probeName, { create: true });
			await handle.removeEntry(probeName);
			probeOk = true;
		} catch {
			// Clean up the probe file in case it was created but deletion failed.
			try { await handle.removeEntry(probeName); } catch {}
		}

		if (!probeOk) {
			// Handle is broken — clear the stored handle so on next load the
			// app starts fresh instead of restoring a known-bad handle.
			await forgetFolder();
			appState.folder = {
				status: 'needs-permission',
				handle,
				name:   result.name,
			};
			appState.lastError = 'Could not access folder. If your files are on iCloud Drive, Chrome does not support it — move them to a local folder.';
			return;
		}

		// Handle is good — transition and refresh.
		appState.folder = { status: 'ready', handle, name: result.name };
		await refresh();
		const folderStatus: string | undefined = appState.folder.status;
		if (folderStatus === 'needs-permission') {
			appState.lastError = 'Could not access folder after reconnecting. Your files may be on iCloud Drive — try a local folder, or restart Chrome.';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement).tagName;
		if (e.key === 'n' && !e.metaKey && !e.ctrlKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
			// If today's week isn't visible, navigate to it first.
			if (appState.weekOffset !== 0) appState.weekOffset = 0;
			todayAddSignal++;
		}
	}
</script>

<svelte:window onfocus={handleFocus} onkeydown={handleKeydown} ondragend={() => (draggingTask = null)} />

{#if !folderReady()}
	<FolderPicker />
{/if}

<div id="topbar">
	<h1>Alph-Planner</h1>
	<div class="week-nav">
		<button class="btn-nav" onclick={() => shiftWeek(-1)}>&#8592;</button>
		<button class="btn-nav" onclick={() => shiftWeek(0)}>Today</button>
		<button class="btn-nav" onclick={() => shiftWeek(1)}>&#8594;</button>
	</div>
	<span id="week-label">{weekLabel}</span>
	<div class="spacer"></div>
	<button
		class="btn-nav"
		class:active={hidePast}
		onclick={() => (hidePast = !hidePast)}
	>Upcoming</button>
	<button
		class="btn-nav"
		class:active={colonCatEnabled}
		onclick={() => (colonCatEnabled = !colonCatEnabled)}
		title="Colon shortcut: type PP: task to add under # PP"
	>Colon</button>
	<button
		class="btn-nav"
		class:active={doneLogOpen}
		onclick={() => (doneLogOpen = !doneLogOpen)}
	>Done log</button>
	<button
		class="btn-nav"
		disabled={isRefreshing}
		onclick={manualRefresh}
		title="Re-read all files from disk"
	>Sync</button>
	<button
		class="btn-nav"
		onclick={changeFolder}
		title="Pick a different folder or reconnect after permission loss"
	>Change folder</button>
	{#if appState.folder.status === 'needs-permission'}
		<button class="btn-nav warn" onclick={changeFolder}>Reconnect folder</button>
	{/if}
	{#if appState.folder.status === 'ready'}
		<span class="folder-badge">{appState.folder.name}/</span>
	{/if}
	{#if appState.conflicts.length > 0}
		<span class="conflict-badge" title={appState.conflicts.join(', ')}>
			&#9888; {appState.conflicts.length} conflict{appState.conflicts.length > 1 ? 's' : ''}
		</span>
	{/if}
</div>

<div id="main">
	<BacklogRail
		backlog={backlogTasks()}
		overdue={overdueTasks(todayISO)}
		todayFilename={todayISO + '.md'}
		ondragstart={(t) => (draggingTask = t)}
		externalDragTask={draggingTask}
	/>
	<div id="columns">
		{#each visibleDays as day (day.iso)}
			<div class="col-wrapper" class:weekend={day.weekend} animate:flip={{ duration: 180 }} transition:slide={{ axis: 'x', duration: 180 }}>
				<DayColumn
					{day}
					tasks={tasksForFile(day.iso + '.md')}
					externalDragTask={draggingTask}
					openSignal={day.today ? todayAddSignal : 0}
					ondragTaskStart={(t) => (draggingTask = t)}
					colonEnabled={colonCatEnabled}
				/>
			</div>
		{/each}
	</div>
</div>

{#if doneLogOpen}
	<DoneLog groups={doneTasksByDate(todayISO)} onclose={() => (doneLogOpen = false)} />
{/if}

<Toast />

<style>
:global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
:global(:root) {
	font-family: system-ui, -apple-system, sans-serif;
	font-size: 14px; color: var(--text); background: var(--bg);
}
:global(body) { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

#topbar {
	display: flex; align-items: center; gap: 8px;
	padding: 0 14px; height: 46px; flex-shrink: 0;
	background: var(--bar-bg); color: var(--bar-text);
}
h1 { font-size: 15px; font-weight: 700; letter-spacing: -.3px; color: var(--bar-text); }
.week-nav { display: flex; gap: 4px; }
.btn-nav {
	padding: 3px 9px; border: 1px solid var(--bar-border);
	background: none; border-radius: 5px; font-size: 12px; cursor: pointer;
	color: var(--text-faint);
}
.btn-nav:hover { background: var(--bar-hover); color: var(--bar-text); border-color: var(--bar-border-strong); }
.btn-nav.active { background: var(--bar-text); color: var(--bar-bg); border-color: var(--bar-text); }
.btn-nav.warn { color: var(--crimson); border-color: var(--crimson); font-weight: 600; }
.btn-nav.warn:hover { background: var(--crimson); color: #fff; }
.btn-nav:disabled { opacity: 0.45; cursor: not-allowed; }
#week-label { font-size: 13px; font-weight: 500; color: var(--bar-text-muted); }
.spacer { flex: 1; }
.folder-badge {
	font-size: 11px; color: var(--bar-text-faint); font-family: monospace;
	background: var(--bar-surface); border: 1px solid var(--bar-border);
	padding: 2px 7px; border-radius: 5px;
}
.conflict-badge {
	font-size: 11px; font-weight: 600; color: var(--bar-text-dim);
	background: var(--bar-muted); border: 1px solid var(--bar-border-strong);
	padding: 2px 8px; border-radius: 5px; cursor: default;
}

#main { display: flex; flex: 1; min-height: 0; overflow: hidden; }
#columns { flex: 1; display: flex; overflow-x: auto; }
.col-wrapper { flex: 1; min-width: 110px; display: flex; overflow: hidden; }
.col-wrapper.weekend { flex: 0.7; min-width: 77px; }

:global(::-webkit-scrollbar) { width: 4px; height: 4px; }
:global(::-webkit-scrollbar-thumb) { background: var(--border); border-radius: 2px; }
</style>
