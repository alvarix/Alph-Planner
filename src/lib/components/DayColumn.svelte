<script lang="ts">
	import type { Task } from '$lib/types.js';
	import type { WeekDay } from '$lib/dates.js';
	import TaskRow from './TaskRow.svelte';
	import { reorderFileTasks, moveTask, moveToCategoryInFile, addCategoryToFile, deleteCategoryFromFile } from '$lib/state.svelte.js';
	import NewTaskInput from './NewTaskInput.svelte';

	let {
		day,
		tasks,
		ondragTaskStart,
		externalDragTask = null,
		openSignal       = 0,
	}: {
		day:               WeekDay;
		tasks:             Task[];
		ondragTaskStart?:  (task: Task) => void;
		externalDragTask?: Task | null;
		openSignal?:       number;
	} = $props();

	let dragOver      = $state(false);
	let addingOpen    = $state(false);
	let addingCat     = $state(false);
	let newCatName    = $state('');
	let catInputEl:   HTMLInputElement;
	let catDelConfirm: string | null = $state(null);

	async function submitCat() {
		const name = newCatName.trim();
		if (!name) { addingCat = false; return; }
		await addCategoryToFile(day.iso + '.md', name);
		newCatName = '';
		addingCat  = false;
	}

	function handleCatKey(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); submitCat(); }
		if (e.key === 'Escape') { addingCat = false; newCatName = ''; }
	}

	$effect(() => { if (addingCat) catInputEl?.focus(); });

	// When the parent increments openSignal (e.g. via n key), open the add input.
	$effect(() => {
		if (openSignal > 0) addingOpen = true;
	});
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
	class:weekend={day.weekend}
	class:drag-over={dragOver}
	role="list"
	ondragover={(e) => { e.preventDefault(); dragOver = true; }}
	ondragleave={() => { dragOver = false; dragOverIndex = null; }}
	ondrop={(e) => {
		e.preventDefault();
		dragOver = false; dragOverIndex = null;
		// Cross-day drop: move task from another column into this one.
		if (externalDragTask && externalDragTask.file !== day.iso + '.md') {
			moveTask(externalDragTask, day.iso + '.md');
		}
	}}
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
					<div class="section-head">
						<span class="cat-name">{section.category}</span>
						{#if catDelConfirm === section.category}
							<span class="cat-del-confirm">
								<button class="cat-del-yes" onclick={async () => {
									await deleteCategoryFromFile(day.iso + '.md', section.category!);
									catDelConfirm = null;
								}}>del</button>
								<button class="cat-del-no" onclick={() => (catDelConfirm = null)}>no</button>
							</span>
						{:else}
							<button class="cat-del-btn" onclick={() => (catDelConfirm = section.category)} title="Delete category">&#x2715;</button>
						{/if}
					</div>
				{/if}
				{#each section.tasks as task, si}
					{@const globalIndex = tasks.indexOf(task)}
					{@const heightPx = Math.max(80, 80 + ((task.estimateMin ?? 30) - 30) / 15 * 25)}
					<div
						class="drop-target"
						class:active={dragOverIndex === globalIndex}
						role="none"
						ondragover={(e) => { e.preventDefault(); e.stopPropagation(); dragOverIndex = globalIndex; }}
						ondrop={(e) => {
							e.preventDefault(); e.stopPropagation();
							dragOver = false; dragOverIndex = null;
							if (dragFromIndex !== null && dragFromIndex !== globalIndex) {
								const dragged = tasks[dragFromIndex];
								if (dragged && dragged.category !== section.category) {
									// Cross-category: move to new section, append at end of it
									moveToCategoryInFile(dragged, section.category);
								} else {
									// Same-category: positional reorder
									reorderFileTasks(day.iso + '.md', dragFromIndex, globalIndex);
								}
								dragFromIndex = null;
							}
						}}
					>
						<TaskRow
							{task}
							colorIndex={colorMap.get(task) ?? null}
							minHeight={heightPx}
							ondragstart={(_e, t) => { dragFromIndex = globalIndex; ondragTaskStart?.(t); }}
							ondragend={() => { dragFromIndex = null; dragOverIndex = null; }}
						/>
					</div>
				{/each}
			{/each}
		{/if}
	</div>

	<!-- Add task / category footer -->
	<div class="col-footer">
		{#if addingOpen}
			<NewTaskInput
				filename={day.iso + '.md'}
				onclose={() => (addingOpen = false)}
			/>
		{:else if addingCat}
			<div class="add-cat-wrap">
				<input
					bind:this={catInputEl}
					bind:value={newCatName}
					class="add-cat-input"
					placeholder="Category name"
					onkeydown={handleCatKey}
				/>
				<div class="add-hint">Enter to add &middot; Esc cancel</div>
			</div>
		{:else}
			<div class="footer-btns">
				<button class="btn-add" onclick={() => (addingOpen = true)}>+ task</button>
				<button class="btn-add-cat" onclick={() => (addingCat = true)} title="Add category"># cat</button>
			</div>
		{/if}
	</div>
</div>

<style>
.day-col {
	flex: 1; min-width: 110px; display: flex; flex-direction: column;
	border-right: 1px solid #e2e8f0; background: #fff;
	overflow: hidden; transition: background .12s, box-shadow .12s;
}
.day-col.weekend { flex: 0.7; min-width: 77px; background: #f4f4f5; }
.day-col.weekend .day-dn  { color: #a1a1aa; }
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
	padding: 4px 8px 3px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: #94a3b8;
	border-bottom: 1px solid #e2e8f0;
	background: #f8fafc;
	display: flex; align-items: center; gap: 4px;
}
.cat-name { flex: 1; }
.cat-del-btn {
	background: none; border: none; cursor: pointer;
	color: #cbd5e1; font-size: 10px; padding: 0 2px;
	opacity: 0; transition: opacity .1s; line-height: 1;
}
.section-head:hover .cat-del-btn { opacity: 1; }
.cat-del-btn:hover { color: #ef4444; }
.cat-del-confirm { display: flex; gap: 3px; align-items: center; }
.cat-del-yes, .cat-del-no {
	font-size: 10px; border-radius: 3px; border: 1px solid;
	padding: 1px 5px; cursor: pointer; line-height: 1.4;
}
.cat-del-yes { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
.cat-del-yes:hover { background: #fee2e2; }
.cat-del-no  { background: #f8fafc; border-color: #e2e8f0; color: #64748b; }
.cat-del-no:hover  { background: #f1f5f9; }

.empty-day {
	flex: 1; display: flex; align-items: center; justify-content: center;
	color: #cbd5e1; font-size: 12px; padding: 20px;
}

.col-footer { flex-shrink: 0; border-top: 1px solid #e2e8f0; }
.footer-btns { display: flex; }
.btn-add {
	flex: 1; padding: 7px 8px; font-size: 11px;
	background: none; border: none; cursor: pointer; color: #94a3b8;
	text-align: left;
}
.btn-add:hover { background: #f8fafc; color: #1e293b; }
.btn-add-cat {
	padding: 7px 8px; font-size: 11px;
	background: none; border: none; border-left: 1px solid #e2e8f0;
	cursor: pointer; color: #cbd5e1;
}
.btn-add-cat:hover { background: #f8fafc; color: #64748b; }
.add-cat-wrap { padding: 6px 8px; border-top: 1px solid #e2e8f0; }
.add-cat-input {
	width: 100%; border: 1px solid #94a3b8; border-radius: 5px;
	padding: 5px 8px; font-size: 12px; outline: none;
	background: #fff;
}
.add-hint { font-size: 10px; color: #94a3b8; margin-top: 3px; }
</style>
