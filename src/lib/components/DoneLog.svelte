<script lang="ts">
	import type { Task } from '$lib/types.js';

	let {
		groups,
	}: {
		groups: { date: string; tasks: Task[] }[];
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

<div id="done-log">
	<div class="done-log-inner">
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
#done-log {
	flex-shrink: 0; border-top: 2px solid #e2e8f0;
	background: #fff; max-height: 180px; overflow-y: auto;
}
.done-log-inner { display: flex; flex-direction: column; }

.done-empty {
	padding: 12px 16px; font-size: 12px; color: #94a3b8; font-style: italic;
}

.done-group { border-bottom: 1px solid #e2e8f0; }
.done-group:last-child { border-bottom: none; }

.done-date {
	padding: 5px 12px 3px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: #94a3b8; background: #f8fafc;
	position: sticky; top: 0;
}

.done-row {
	display: flex; align-items: baseline; gap: 6px;
	padding: 4px 12px; border-top: 1px solid #f1f5f9;
}
.done-check { color: #4ade80; font-size: 11px; flex-shrink: 0; }
.done-title { font-size: 12px; color: #94a3b8; text-decoration: line-through; flex: 1; }
.done-title.starred { font-weight: 700; }
.done-dur { font-size: 10px; color: #cbd5e1; flex-shrink: 0; }
</style>
