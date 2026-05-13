<script lang="ts">
	import type { Task } from '$lib/types.js';
	import { appState, moveTask, addTask, toggleStar, addCategoryToFile, deleteCategoryFromFile, moveToCategoryInFile, deleteTask } from '$lib/state.svelte.js';
	import TaskRow from './TaskRow.svelte';

	let {
		backlog,
		overdue,
		todayFilename,
		ondragstart,
		externalDragTask = null,
	}: {
		backlog:           Task[];
		overdue:           Task[];
		todayFilename:     string;
		ondragstart?:      (task: Task) => void;
		externalDragTask?: Task | null;
	} = $props();

	const allItems    = $derived([...backlog, ...overdue]);
	const fileHeaders = $derived(appState.backlogHeaders);

	/** Group backlog tasks by their category, preserving file order.
	 *  Also includes empty sections for H1 headers that have no tasks yet. */
	const backlogSections = $derived.by(() => {
		const result: { category: string | null; tasks: Task[] }[] = [];
		for (const t of backlog) {
			const last = result.at(-1);
			if (last && last.category === t.category) {
				last.tasks.push(t);
			} else {
				result.push({ category: t.category, tasks: [t] });
			}
		}
		// Append sections for H1 headers in the file that have no tasks yet
		const seenCats = new Set(result.map(s => s.category));
		for (const h of fileHeaders) {
			if (!seenCats.has(h)) result.push({ category: h, tasks: [] });
		}
		return result;
	});

	// Use file headers so empty categories still appear in the add-task picker.
	const categories = $derived(appState.backlogHeaders);

	let adding     = $state(false);
	let addValue   = $state('');
	let addCat     = $state('');
	let addInputEl: HTMLInputElement;

	let addingCat  = $state(false);
	let newCatName = $state('');
	let catInputEl: HTMLInputElement;

	let dragOver         = $state(false);
	let sectionDragOver: string | null | undefined = $state(undefined);
	let catDelConfirm: string | null = $state(null);

	/** Drop an external task onto a specific category within Backlog.md. */
	async function dropOnSection(task: Task, category: string | null) {
		if (task.file === 'Backlog.md') {
			await moveToCategoryInFile(task, category);
		} else {
			const block = [task.raw, ...task.children.map(c => c.raw)].join('\n');
			await addTask('Backlog.md', block, category);
			await deleteTask(task);
		}
	}

	async function rollAll() {
		for (const task of allItems) {
			await moveTask(task, todayFilename);
		}
	}

	function buildLine(raw: string): string | null {
		const text = raw.trim();
		if (!text) return null;
		const durMatch = text.match(/\s+(\d*\.?\d+\s*(?:h|m))$/i);
		const dur      = durMatch ? durMatch[0] : '';
		const title    = durMatch ? text.slice(0, durMatch.index).trim() : text;
		if (!title) return null;
		return `- [ ] ${title}${dur}`;
	}

	async function submitAdd() {
		const line = buildLine(addValue);
		if (!line) return;
		await addTask('Backlog.md', line, addCat || null);
		addValue = '';
		addCat   = '';
		adding   = false;
	}

	function handleAddKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAdd(); }
		if (e.key === 'Escape') { adding = false; addValue = ''; addCat = ''; }
	}

	async function submitCat() {
		const name = newCatName.trim();
		if (!name) { addingCat = false; return; }
		await addCategoryToFile('Backlog.md', name);
		newCatName = '';
		addingCat  = false;
	}

	function handleCatKey(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); submitCat(); }
		if (e.key === 'Escape') { addingCat = false; newCatName = ''; }
	}

	$effect(() => { if (adding)    addInputEl?.focus(); });
	$effect(() => { if (addingCat) catInputEl?.focus(); });
</script>


<aside
	id="backlog-rail"
	class:drag-over={dragOver}
	role="region"
	aria-label="Backlog"
	ondragover={(e) => { e.preventDefault(); dragOver = true; }}
	ondragleave={() => { dragOver = false; }}
	ondrop={(e) => {
		e.preventDefault();
		dragOver = false;
		if (externalDragTask && externalDragTask.file !== 'Backlog.md') {
			moveTask(externalDragTask, 'Backlog.md');
		}
	}}
>
	<div class="rail-head">
		Backlog
		{#if allItems.length > 0}
			<span class="badge">{allItems.length}</span>
		{/if}
		<button class="icon-btn" onclick={() => { addingCat = !addingCat; adding = false; }} title="Add category">#</button>
		<button class="add-btn"  onclick={() => { adding = !adding; addingCat = false; }} title="Add task">+</button>
	</div>

	{#if adding}
		<div class="add-form">
			{#if categories.length > 0}
				<select class="add-cat" bind:value={addCat}>
					<option value="">no category</option>
					{#each categories as cat}
						<option value={cat}>{cat}</option>
					{/each}
				</select>
			{/if}
			<input
				bind:this={addInputEl}
				bind:value={addValue}
				class="add-input"
				placeholder="task title 1h"
				onkeydown={handleAddKey}
			/>
			<div class="add-hint">Enter to add &middot; Esc cancel</div>
		</div>
	{/if}

	{#if addingCat}
		<div class="add-form">
			<input
				bind:this={catInputEl}
				bind:value={newCatName}
				class="add-input"
				placeholder="Category name"
				onkeydown={handleCatKey}
			/>
			<div class="add-hint">Enter to add &middot; Esc cancel</div>
		</div>
	{/if}

	<div class="rail-list">
		{#if overdue.length > 0}
			<div class="section-head overdue-head">Overdue</div>
			{#each overdue as task}
				<TaskRow
					{task}
					ondragstart={(e, t) => { e.dataTransfer?.setData('text/plain', t.title); ondragstart?.(t); }}
				/>
			{/each}
		{/if}

		<!-- No-category drop zone: a thin strip at the top for dropping tasks back to uncategorised -->
		<div
			class="null-drop"
			class:drag-over-section={sectionDragOver === null}
			ondragover={(e) => { e.preventDefault(); e.stopPropagation(); sectionDragOver = null; }}
			ondragleave={() => { sectionDragOver = undefined; }}
			ondrop={async (e) => {
				e.preventDefault(); e.stopPropagation();
				sectionDragOver = undefined; dragOver = false;
				if (externalDragTask) await dropOnSection(externalDragTask, null);
			}}
		></div>

		{#each backlogSections as section}
			{#if section.category}
				<div
					class="section-head"
					class:drag-over-section={sectionDragOver === section.category}
					ondragover={(e) => { e.preventDefault(); e.stopPropagation(); sectionDragOver = section.category; }}
					ondragleave={() => { sectionDragOver = undefined; }}
					ondrop={async (e) => {
						e.preventDefault(); e.stopPropagation();
						sectionDragOver = undefined; dragOver = false;
						if (externalDragTask) await dropOnSection(externalDragTask, section.category);
					}}
				>
					<span class="cat-name">{section.category}</span>
					{#if catDelConfirm === section.category}
						<span class="del-confirm">
							<button class="del-yes" onclick={async () => {
								await deleteCategoryFromFile('Backlog.md', section.category!);
								catDelConfirm = null;
							}}>del</button>
							<button class="del-no" onclick={() => (catDelConfirm = null)}>no</button>
						</span>
					{:else}
						<button class="cat-del-btn" onclick={() => (catDelConfirm = section.category)} title="Delete category">&#x2715;</button>
					{/if}
				</div>
			{/if}
			{#each section.tasks as task}
				<TaskRow
					{task}
					ondragstart={(e, t) => { e.dataTransfer?.setData('text/plain', t.title); ondragstart?.(t); }}
				/>
			{/each}
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
	overflow: hidden; transition: box-shadow .12s;
}
#backlog-rail.drag-over {
	box-shadow: inset 0 0 0 2px #f87171;
	background: #fef2f2;
}
.rail-head {
	padding: 8px 12px; font-size: 11px; font-weight: 700;
	text-transform: uppercase; letter-spacing: .5px; color: #b91c1c;
	border-bottom: 1px solid #fecaca; flex-shrink: 0;
	display: flex; align-items: center; gap: 4px;
}
.badge {
	background: #fee2e2; color: #b91c1c; font-size: 10px;
	padding: 1px 6px; border-radius: 99px; font-weight: 700;
	margin-right: auto;
}
.icon-btn, .add-btn {
	background: none; border: none; cursor: pointer;
	color: #b91c1c; font-size: 14px; line-height: 1;
	padding: 0 3px; flex-shrink: 0;
}
.icon-btn { font-size: 12px; font-weight: 700; }
.icon-btn:hover, .add-btn:hover { color: #7f1d1d; }

.add-form {
	padding: 6px 8px; border-bottom: 1px solid #fecaca;
	background: #fff5f5;
}
.add-cat {
	width: 100%; margin-bottom: 4px; font-size: 11px;
	border: 1px solid #fecaca; border-radius: 4px;
	padding: 3px 5px; background: #fff; color: #7f1d1d;
}
.add-input {
	width: 100%; border: 1px solid #f87171; border-radius: 4px;
	padding: 4px 7px; font-size: 12px; outline: none;
	background: #fff; box-shadow: 0 0 0 2px #fecaca40;
}
.add-hint { font-size: 10px; color: #fca5a5; margin-top: 3px; }

.rail-list { flex: 1; overflow-y: auto; }

.section-head {
	padding: 4px 8px 3px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: #b91c1c;
	border-bottom: 1px solid #fecaca;
	background: #fee2e2;
	display: flex; align-items: center; gap: 4px;
}
.overdue-head { color: #7f1d1d; background: #fecaca; }
.cat-name { flex: 1; }
.cat-del-btn {
	background: none; border: none; cursor: pointer;
	color: #fca5a5; font-size: 10px; padding: 0 2px;
	opacity: 0; transition: opacity .1s;
	line-height: 1;
}
.section-head:hover .cat-del-btn { opacity: 1; }
.cat-del-btn:hover { color: #dc2626; }
.section-head.drag-over-section { background: #fca5a5; }

.null-drop { height: 4px; background: transparent; transition: height .1s, background .1s; }
.null-drop.drag-over-section { height: 14px; background: #fecaca; }

.del-confirm { display: flex; gap: 3px; align-items: center; }
.del-yes, .del-no {
	font-size: 10px; border-radius: 3px; border: 1px solid;
	padding: 1px 5px; cursor: pointer; line-height: 1.4;
}
.del-yes { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
.del-yes:hover { background: #fee2e2; }
.del-no  { background: #fff5f5; border-color: #fecaca; color: #7f1d1d; }
.del-no:hover  { background: #fee2e2; }


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
