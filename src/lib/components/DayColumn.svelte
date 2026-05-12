<script lang="ts">
	import type { Task } from '$lib/types.js';
	import type { WeekDay } from '$lib/dates.js';
	import TaskRow from './TaskRow.svelte';
	import { reorderFileTasks } from '$lib/state.svelte.js';

	let {
		day,
		tasks,
	}: {
		day:   WeekDay;
		tasks: Task[];
	} = $props();

	let dragOver   = $state(false);
	let dragFromIndex: number | null = null;
	let dragOverIndex: number | null = $state(null);

	/** Assign a stable color index per task-with-children within this column. */
	const colorMap = $derived.by(() => {
		let idx = 0;
		return tasks.reduce((m, t) => {
			if (t.children.length > 0) m.set(t, idx++);
			return m;
		}, new Map<Task, number>());
	});

	const totalMin = $derived(
		tasks.reduce((s, t) => s + (t.estimateMin ?? 0), 0)
	);

	function formatTotal(min: number): string {
		if (min === 0) return '';
		return min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`;
	}

	/** Group tasks by category for rendering section dividers. */
	const sections = $derived.by(() => {
		const result: { category: string | null; tasks: Task[] }[] = [];
		for (const t of tasks) {
			const last = result.at(-1);
			if (last && last.category === t.category) {
				last.tasks.push(t);
			} else {
				result.push({ category: t.category, tasks: [t] });
			}
		}
		return result;
	});
</script>

<div
	class="day-col"
	class:today={day.today}
	class:past={day.past}
	class:drag-over={dragOver}
	role="list"
	ondragover={(e) => { e.preventDefault(); dragOver = true; }}
	ondragleave={() => { dragOver = false; dragOverIndex = null; }}
	ondrop={(e) => { e.preventDefault(); dragOver = false; dragOverIndex = null; }}
>
	<!-- Header -->
	<div class="day-head">
		<div class="day-dn">{day.label}</div>
		<div class="day-date-num">{day.date}</div>
		{#if totalMin > 0}
			<div class="day-total">{formatTotal(totalMin)}</div>
		{/if}
	</div>

	<!-- Tasks -->
	<div class="task-list">
		{#if tasks.length === 0}
			<div class="empty-day">no tasks</div>
		{:else}
			{#each sections as section}
				{#if section.category}
					<div class="section-head">{section.category}</div>
				{/if}
				{#each section.tasks as task, si}
					{@const globalIndex = tasks.indexOf(task)}
					<div
						class="drop-target"
						class:active={dragOverIndex === globalIndex}
						role="none"
						ondragover={(e) => { e.preventDefault(); e.stopPropagation(); dragOverIndex = globalIndex; }}
						ondrop={(e) => {
							e.preventDefault(); e.stopPropagation();
							dragOver = false; dragOverIndex = null;
							if (dragFromIndex !== null && dragFromIndex !== globalIndex) {
								reorderFileTasks(day.iso + '.md', dragFromIndex, globalIndex);
								dragFromIndex = null;
							}
						}}
					>
						<TaskRow
							{task}
							colorIndex={colorMap.get(task) ?? null}
							ondragstart={(_e, _t) => { dragFromIndex = globalIndex; }}
							ondragend={() => { dragFromIndex = null; dragOverIndex = null; }}
						/>
					</div>
				{/each}
			{/each}
		{/if}
	</div>

	<!-- Add task footer -->
	<div class="col-footer">
		<button class="btn-add">+ add task</button>
	</div>
</div>

<style>
.day-col {
	flex: 1; min-width: 110px; display: flex; flex-direction: column;
	border-right: 1px solid #e2e8f0; background: #fff;
	overflow: hidden; transition: background .12s, box-shadow .12s;
}
.day-col.today  { background: #f0f9ff; }
.day-col.drag-over {
	background: #eff6ff;
	box-shadow: inset 0 0 0 2px #bfdbfe;
}
.day-col:last-child { border-right: none; }

.day-head {
	padding: 8px 10px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
}
.day-col.today .day-head { border-bottom: 2px solid #0ea5e9; }

.day-dn {
	font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
	color: #94a3b8; font-weight: 600;
}
.day-col.today .day-dn { color: #0ea5e9; }

.day-date-num { font-size: 20px; font-weight: 700; line-height: 1.2; margin: 2px 0 1px; }
.day-col.today .day-date-num {
	display: inline-flex; align-items: center; justify-content: center;
	width: 30px; height: 30px; background: #0ea5e9; color: #fff;
	border-radius: 50%; font-size: 14px;
}
.day-total { font-size: 10px; color: #94a3b8; }

.task-list { flex: 1; overflow-y: auto; }

.drop-target { position: relative; }
.drop-target.active::before {
	content: '';
	position: absolute; top: 0; left: 6px; right: 6px; height: 2px;
	background: #0ea5e9; border-radius: 1px; z-index: 10;
}

.section-head {
	padding: 5px 10px 3px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: #94a3b8;
	border-bottom: 1px solid #e2e8f0;
	background: #f8fafc;
}

.empty-day {
	flex: 1; display: flex; align-items: center; justify-content: center;
	color: #cbd5e1; font-size: 12px; padding: 20px;
}

.col-footer { flex-shrink: 0; border-top: 1px solid #e2e8f0; }
.btn-add {
	width: 100%; padding: 7px 10px; font-size: 11px;
	background: none; border: none; cursor: pointer; color: #94a3b8;
	text-align: left;
}
.btn-add:hover { background: #f8fafc; color: #1e293b; }
</style>
