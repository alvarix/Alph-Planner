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
			{#each groups as group}
				<div class="done-group">
					<div class="done-date">{formatDate(group.date)}</div>
					{#each group.tasks as task}
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
	border-top: 2px solid #e2e8f0;
	box-shadow: 0 -6px 24px rgba(0,0,0,.08);
}

.drawer-header {
	display: flex; align-items: center; gap: 8px;
	padding: 0 14px; height: 38px; flex-shrink: 0;
	border-bottom: 1px solid #e2e8f0;
}
.drawer-title {
	font-size: 12px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: #64748b;
}
.drawer-count {
	font-size: 10px; background: #f1f5f9; color: #64748b;
	padding: 1px 7px; border-radius: 99px; font-weight: 700;
}
.drawer-close {
	margin-left: auto;
	background: none; border: none; cursor: pointer;
	color: #94a3b8; font-size: 13px; padding: 4px 6px; line-height: 1;
	border-radius: 4px;
}
.drawer-close:hover { background: #f1f5f9; color: #1e293b; }

.drawer-body { flex: 1; overflow-y: auto; }

.done-empty {
	padding: 16px; font-size: 12px; color: #94a3b8; font-style: italic;
}

.done-group { border-bottom: 1px solid #e2e8f0; }
.done-group:last-child { border-bottom: none; }

.done-date {
	padding: 5px 14px 3px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: #94a3b8; background: #f8fafc;
	position: sticky; top: 0;
}

.done-row {
	display: flex; align-items: baseline; gap: 6px;
	padding: 4px 14px; border-top: 1px solid #f1f5f9;
}
.done-check { color: #4ade80; font-size: 11px; flex-shrink: 0; }
.done-title { font-size: 12px; color: #94a3b8; text-decoration: line-through; flex: 1; }
.done-title.starred { font-weight: 700; }
.done-dur { font-size: 10px; color: #cbd5e1; flex-shrink: 0; }
</style>
