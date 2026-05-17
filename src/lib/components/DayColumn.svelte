<script lang="ts">
	import type { Task } from '$lib/types.js';
	import type { WeekDay } from '$lib/dates.js';
	import TaskRow from './TaskRow.svelte';
	import { appState, reorderFileTasks, moveTask, moveToCategoryInFile, addCategoryToFile, deleteCategoryFromFile, addTask, deleteTask, notesFor } from '$lib/state.svelte.js';
	import NewTaskInput from './NewTaskInput.svelte';
	import NotesPopover from './NotesPopover.svelte';

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

	let dragOver         = $state(false);
	let sectionDragOver: string | null | undefined = $state(undefined);
	let addingOpen    = $state(false);
	let addingCat     = $state(false);
	let notesOpen     = $state(false);
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

	const filename = $derived(day.iso + '.md');
	const dayFileHeaders = $derived(appState.fileHeaders[filename] ?? []);

	/** Drop a task (internal or external) onto a specific category section. */
	async function dropOnSection(category: string | null) {
		dragOver = false; sectionDragOver = undefined;
		if (dragFromIndex !== null) {
			const dragged = tasks[dragFromIndex];
			if (dragged) await moveToCategoryInFile(dragged, category);
			dragFromIndex = null;
		} else if (externalDragTask) {
			if (externalDragTask.file === filename) {
				await moveToCategoryInFile(externalDragTask, category);
			} else {
				const block = [externalDragTask.raw, ...externalDragTask.children.map(c => c.raw)].join('\n');
				await addTask(filename, block, category);
				await deleteTask(externalDragTask);
			}
		}
	}

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

	/** Group tasks by category, overlaying empty H1 headers from the file. */
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
		const seenCats = new Set(result.map(s => s.category));
		for (const h of dayFileHeaders) {
			if (!seenCats.has(h)) result.push({ category: h, tasks: [] });
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

	<!-- Notes panel (full height, replaces task list) -->
	{#if notesOpen}
		<NotesPopover
			{filename}
			initialText={notesFor(filename)}
			onclose={() => (notesOpen = false)}
		/>
	{/if}

	<!-- Tasks -->
	<div class="task-list" class:hidden={notesOpen}>
		{#if tasks.length === 0 && dayFileHeaders.length === 0}
			<div class="empty-day">no tasks</div>
		{:else}
			{#each sections as section}
				{#if section.category}
					<div
						class="section-head"
						class:drag-over-section={sectionDragOver === section.category}
						ondragover={(e) => { e.preventDefault(); e.stopPropagation(); sectionDragOver = section.category; }}
						ondragleave={() => { sectionDragOver = undefined; }}
						ondrop={async (e) => { e.preventDefault(); e.stopPropagation(); await dropOnSection(section.category); }}
					>
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

	<!-- Add task / category / notes footer -->
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
				<button
					class="btn-notes"
					class:has-notes={notesFor(filename) !== ''}
					onclick={() => (notesOpen = !notesOpen)}
					title="Notes"
				>&#x270D;</button>
			</div>
		{/if}
	</div>
</div>

<style>
.day-col {
	flex: 1; min-width: 110px; display: flex; flex-direction: column;
	border-right: 1px solid var(--border); background: var(--surface);
	overflow: hidden; transition: background .12s, box-shadow .12s;
}
.day-col.weekend { flex: 0.7; min-width: 77px; background: var(--surface-muted); }
.day-col.weekend .day-dn  { color: var(--text-dimmed); }
.day-col.today  { background: var(--surface-raised); }
.day-col.drag-over {
	background: var(--surface-muted);
	box-shadow: inset 0 0 0 2px var(--border-mid);
}
.day-col:last-child { border-right: none; }

.day-head {
	padding: 8px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.day-col.today .day-head { border-bottom: 2px solid var(--crimson); }

.day-dn {
	font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
	color: var(--text-muted); font-weight: 600;
}
.day-col.today .day-dn { color: var(--crimson); }

.day-date-num { font-size: 20px; font-weight: 700; line-height: 1.2; margin: 2px 0 1px; }
.day-col.today .day-date-num {
	display: inline-flex; align-items: center; justify-content: center;
	width: 30px; height: 30px; background: var(--crimson); color: var(--surface);
	border-radius: 50%; font-size: 14px;
}
.day-total { font-size: 10px; color: var(--text-muted); }

.task-list {
	flex: 1; overflow-y: auto;
	background-color: var(--surface-pattern);
	background-image: radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px);
	background-size: 14px 14px;
	padding-top: 4px;
}
.task-list.hidden { display: none; }

.drop-target { position: relative; }
.drop-target.active::before {
	content: '';
	position: absolute; top: 0; left: 6px; right: 6px; height: 2px;
	background: var(--text-mid); border-radius: 1px; z-index: 10;
}

.section-head {
	padding: 4px 8px 3px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: var(--text-muted);
	border-bottom: 1px solid var(--border);
	background: var(--bg);
	display: flex; align-items: center; gap: 4px;
}
.cat-name { flex: 1; }
.cat-del-btn {
	background: none; border: none; cursor: pointer;
	color: var(--text-faint); font-size: 10px; padding: 0 2px;
	opacity: 0; transition: opacity .1s; line-height: 1;
}
.section-head:hover .cat-del-btn { opacity: 1; }
.cat-del-btn:hover { color: var(--text-dark); }
.section-head.drag-over-section { background: var(--border); }
.cat-del-confirm { display: flex; gap: 3px; align-items: center; }
.cat-del-yes, .cat-del-no {
	font-size: 10px; border-radius: 3px; border: 1px solid;
	padding: 1px 5px; cursor: pointer; line-height: 1.4;
}
.cat-del-yes { background: var(--bg); border-color: var(--border-mid); color: var(--text-dark); }
.cat-del-yes:hover { background: var(--surface-em); }
.cat-del-no  { background: var(--bg); border-color: var(--border); color: var(--text-subtle); }
.cat-del-no:hover  { background: var(--surface-muted); }

.empty-day {
	flex: 1; display: flex; align-items: center; justify-content: center;
	color: var(--text-faint); font-size: 12px; padding: 20px;
}

.col-footer { flex-shrink: 0; border-top: 1px solid var(--border); }
.footer-btns { display: flex; }
.btn-add {
	flex: 1; padding: 7px 8px; font-size: 11px;
	background: none; border: none; cursor: pointer; color: var(--text-muted);
	text-align: left;
}
.btn-add:hover { background: var(--bg); color: var(--text); }
.btn-add-cat {
	padding: 7px 8px; font-size: 11px;
	background: none; border: none; border-left: 1px solid var(--border);
	cursor: pointer; color: var(--text-faint);
}
.btn-add-cat:hover { background: var(--bg); color: var(--text-subtle); }
.btn-notes {
	padding: 7px 8px; font-size: 13px;
	background: none; border: none; border-left: 1px solid var(--border);
	cursor: pointer; color: var(--text-faint); line-height: 1;
}
.btn-notes:hover { background: var(--bg); color: var(--text-subtle); }
.btn-notes.has-notes { color: var(--text-mid); }
.add-cat-wrap { padding: 6px 8px; border-top: 1px solid var(--border); }
.add-cat-input {
	width: 100%; border: 1px solid var(--border-input); border-radius: 5px;
	padding: 5px 8px; font-size: 12px; outline: none;
	background: var(--surface);
}
.add-hint { font-size: 10px; color: var(--text-muted); margin-top: 3px; }
</style>
