<script lang="ts">
	import type { Task } from '$lib/types.js';
	import { moveTask } from '$lib/state.svelte.js';

	let {
		backlog,
		overdue,
		todayFilename,
		ondragstart,
	}: {
		backlog:       Task[];           // tasks from Backlog.md
		overdue:       Task[];           // unchecked tasks from past daily files
		todayFilename: string;           // "YYYY-MM-DD.md" for today
		ondragstart?:  (task: Task) => void;
	} = $props();

	const allItems = $derived([...backlog, ...overdue]);

	async function rollAll() {
		for (const task of allItems) {
			await moveTask(task, todayFilename);
		}
	}

	function formatDate(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<aside id="backlog-rail">
	<div class="rail-head">
		Backlog
		{#if allItems.length > 0}
			<span class="badge">{allItems.length}</span>
		{/if}
	</div>

	<div class="rail-list">
		{#each allItems as task}
			<div
				class="backlog-item"
				role="listitem"
				draggable="true"
				ondragstart={(e) => {
					e.dataTransfer?.setData('text/plain', task.title);
					ondragstart?.(task);
				}}
			>
				<span class="drag-handle">&#8942;&#8942;</span>
				<div class="bk-body">
					<span class="bk-title" class:starred={task.starred}>{task.title}</span>
					{#if task.estimateMin}
						<span class="bk-dur">
							{task.estimateMin % 60 === 0
								? `${task.estimateMin / 60}h`
								: `${task.estimateMin}m`}
						</span>
					{/if}
					{#if task.date}
						<div>
							<span class="date-tag">{formatDate(task.date)}</span>
						</div>
					{/if}
				</div>
			</div>
		{/each}

		{#if allItems.length === 0}
			<div class="empty">no backlog items</div>
		{/if}
	</div>

	{#if allItems.length > 0}
		<div class="rail-footer">
			<button class="btn-roll" onclick={rollAll}>Roll all to today &rarr;</button>
		</div>
	{/if}
</aside>

<style>
#backlog-rail {
	width: 176px; flex-shrink: 0;
	display: flex; flex-direction: column;
	background: #fff5f5; border-right: 1px solid #fecaca;
	overflow: hidden;
}
.rail-head {
	padding: 8px 12px; font-size: 11px; font-weight: 700;
	text-transform: uppercase; letter-spacing: .5px; color: #b91c1c;
	border-bottom: 1px solid #fecaca; flex-shrink: 0;
	display: flex; align-items: center; justify-content: space-between;
}
.badge {
	background: #fee2e2; color: #b91c1c; font-size: 10px;
	padding: 1px 6px; border-radius: 99px; font-weight: 700;
}
.rail-list { flex: 1; overflow-y: auto; }

.backlog-item {
	padding: 7px 10px; border-bottom: 1px solid #fecaca;
	cursor: grab; display: flex; align-items: flex-start;
	gap: 6px; transition: background .1s;
}
.backlog-item:hover { background: rgba(254,202,202,.2); }

.drag-handle { color: #fca5a5; font-size: 11px; flex-shrink: 0; padding-top: 1px; }
.bk-body { flex: 1; min-width: 0; }
.bk-title { font-size: 12px; font-weight: 500; line-height: 1.3; }
.bk-title.starred { font-weight: 700; }
.bk-dur { font-size: 10px; color: #b91c1c; opacity: .7; margin-left: 4px; }

.date-tag {
	display: inline-block; font-size: 10px; font-weight: 600;
	font-family: monospace; background: #fee2e2; color: #dc2626;
	padding: 1px 5px; border-radius: 3px; margin-top: 3px;
}

.empty {
	padding: 16px 12px; font-size: 12px; color: #fca5a5; text-align: center;
}

.rail-footer {
	padding: 8px 10px; border-top: 1px solid #fecaca; flex-shrink: 0;
}
.btn-roll {
	width: 100%; padding: 6px 10px; font-size: 11px; font-weight: 600;
	background: #fff; border: 1px solid #fecaca;
	border-radius: 5px; cursor: pointer; color: #b91c1c;
}
.btn-roll:hover { background: #fee2e2; }
</style>
