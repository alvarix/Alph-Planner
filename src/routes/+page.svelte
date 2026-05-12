<script lang="ts">
	import { onMount } from 'svelte';
	import { getWeekDays, weekRangeLabel } from '$lib/dates.js';
	import { restoreFolder } from '$lib/fs/folder.js';
	import { appState, refresh, tasksForFile, backlogTasks, overdueTasks, doneTasksByDate, folderReady } from '$lib/state.svelte.js';
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

	function handleFocus() {
		if (folderReady()) refresh();
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

<svelte:window onfocus={handleFocus} onkeydown={handleKeydown} />

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
		class:active={doneLogOpen}
		onclick={() => (doneLogOpen = !doneLogOpen)}
	>Done log</button>
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
	/>
	<div id="columns">
		{#each weekDays as day}
			<DayColumn
				{day}
				tasks={tasksForFile(day.iso + '.md')}
				externalDragTask={draggingTask}
				openSignal={day.today ? todayAddSignal : 0}
				ondragTaskStart={(t) => (draggingTask = t)}
			/>
		{/each}
	</div>
</div>

{#if doneLogOpen}
	<DoneLog groups={doneTasksByDate(todayISO)} />
{/if}

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
.btn-nav.active { background: #1e293b; color: #fff; border-color: #1e293b; }
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
