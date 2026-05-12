<script lang="ts">
	import { onMount } from 'svelte';
	import { getWeekDays, weekRangeLabel } from '$lib/dates.js';
	import { restoreFolder } from '$lib/fs/folder.js';
	import { appState, refresh, tasksForFile, folderReady } from '$lib/state.svelte.js';
	import type { Task } from '$lib/types.js';
	import FolderPicker from '$lib/components/FolderPicker.svelte';
	import DayColumn from '$lib/components/DayColumn.svelte';
	import Toast from '$lib/components/Toast.svelte';

	const weekDays  = $derived(getWeekDays(appState.weekOffset));
	const weekLabel = $derived(weekRangeLabel(appState.weekOffset));

	let draggingTask: Task | null = $state(null);

	function shiftWeek(dir: -1 | 0 | 1) {
		if (dir === 0) appState.weekOffset = 0;
		else appState.weekOffset += dir;
	}

	onMount(async () => {
		// Try to restore previously picked folder silently.
		const restored = await restoreFolder();
		appState.folder = restored;
		if (restored.status === 'ready') await refresh();
	});

	// Refresh cache whenever the window regains focus.
	function handleFocus() {
		if (folderReady()) refresh();
	}
</script>

<svelte:window onfocus={handleFocus} />

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
	<div id="columns">
		{#each weekDays as day}
			<DayColumn
				{day}
				tasks={tasksForFile(day.iso + '.md')}
				externalDragTask={draggingTask}
				ondragTaskStart={(t) => (draggingTask = t)}
			/>
		{/each}
	</div>
</div>

<Toast />

<style>
:global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
:global(:root) {
	font-family: system-ui, -apple-system, sans-serif;
	font-size: 14px; color: #1e293b; background: #f8fafc;
}
:global(body) { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

#topbar {
	display: flex; align-items: center; gap: 8px;
	padding: 0 14px; height: 46px; flex-shrink: 0;
	background: #fff; border-bottom: 1px solid #e2e8f0;
}
h1 { font-size: 15px; font-weight: 700; letter-spacing: -.3px; }
.week-nav { display: flex; gap: 4px; }
.btn-nav {
	padding: 3px 9px; border: 1px solid #e2e8f0;
	background: none; border-radius: 5px; font-size: 12px; cursor: pointer;
}
.btn-nav:hover { background: #f8fafc; }
#week-label { font-size: 13px; font-weight: 500; }
.spacer { flex: 1; }
.folder-badge {
	font-size: 11px; color: #94a3b8; font-family: monospace;
	background: #f8fafc; border: 1px solid #e2e8f0;
	padding: 2px 7px; border-radius: 5px;
}
.conflict-badge {
	font-size: 11px; font-weight: 600; color: #dc2626;
	background: #fee2e2; border: 1px solid #fecaca;
	padding: 2px 8px; border-radius: 5px; cursor: default;
}

#main { display: flex; flex: 1; min-height: 0; overflow: hidden; }
#columns { flex: 1; display: flex; overflow-x: auto; }

:global(::-webkit-scrollbar) { width: 4px; height: 4px; }
:global(::-webkit-scrollbar-thumb) { background: #e2e8f0; border-radius: 2px; }
</style>
