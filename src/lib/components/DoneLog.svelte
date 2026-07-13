<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Task } from '$lib/types.js';

	let {
		groups,
		onclose,
	}: {
		groups:   { date: string; tasks: Task[] }[];
		onclose?: () => void;
	} = $props();

	function formatDate(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function formatDur(min: number): string {
		return min % 60 === 0 ? `${min / 60}h` : `${min}m`;
	}

	const totalDone = $derived(groups.reduce((s, g) => s + g.tasks.length, 0));
</script>

<div id="done-drawer" transition:fly={{ y: 320, duration: 220, opacity: 1 }}>
	<div class="drawer-header">
		<span class="drawer-title">Done log</span>
		{#if totalDone > 0}
			<span class="drawer-count">{totalDone}</span>
		{/if}
		<button class="drawer-close" onclick={onclose} aria-label="Close done log">&#x2715;</button>
	</div>

	<div class="drawer-body">
		{#if groups.length === 0}
			<div class="done-empty">No completed tasks in the last 30 days.</div>
		{:else}
			{#each groups as group (group.date)}
				<div class="done-group">
					<div class="done-date">{formatDate(group.date)}</div>
					{#each group.tasks as task (task.file + ':' + task.lineRange[0])}
						<div class="done-row">
							<span class="done-check">&#10003;</span>
							<span class="done-title" class:starred={task.starred}>{task.title}</span>
							{#if task.estimateMin}
								<span class="done-dur">{formatDur(task.estimateMin)}</span>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
#done-drawer {
	position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
	height: 300px;
	display: flex; flex-direction: column;
	background: #fff;
	border-top: 2px solid var(--border);
	box-shadow: 0 -6px 24px rgba(0,0,0,.08);
}

.drawer-header {
	display: flex; align-items: center; gap: 8px;
	padding: 0 14px; height: 38px; flex-shrink: 0;
	border-bottom: 1px solid var(--border);
}
.drawer-title {
	font-size: 12px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: var(--text-subtle);
}
.drawer-count {
	font-size: 10px; background: var(--surface-muted); color: var(--text-subtle);
	padding: 1px 7px; border-radius: 99px; font-weight: 700;
}
.drawer-close {
	margin-left: auto;
	background: none; border: none; cursor: pointer;
	color: var(--text-muted); font-size: 13px; padding: 4px 6px; line-height: 1;
	border-radius: 4px;
}
.drawer-close:hover { background: var(--surface-muted); color: var(--text); }

.drawer-body { flex: 1; overflow-y: auto; }

.done-empty {
	padding: 16px; font-size: 12px; color: var(--text-muted); font-style: italic;
}

.done-group { border-bottom: 1px solid var(--border); }
.done-group:last-child { border-bottom: none; }

.done-date {
	padding: 5px 14px 3px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: var(--text-muted); background: var(--bg);
	position: sticky; top: 0;
}

.done-row {
	display: flex; align-items: baseline; gap: 6px;
	padding: 4px 14px; border-top: 1px solid var(--surface-muted);
}
.done-check { color: var(--text-faint); font-size: 11px; flex-shrink: 0; }
.done-title { font-size: 12px; color: var(--text-muted); text-decoration: line-through; flex: 1; }
.done-title.starred { font-weight: 700; }
.done-dur { font-size: 10px; color: var(--text-faint); flex-shrink: 0; }
</style>
