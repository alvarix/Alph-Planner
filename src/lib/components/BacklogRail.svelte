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
	background: var(--bg); border-right: 1px solid var(--border);
	overflow: hidden; transition: box-shadow .12s;
}
#backlog-rail.drag-over {
	box-shadow: inset 0 0 0 2px var(--border-mid);
	background: var(--surface-muted);
}
.rail-head {
	padding: 8px 12px; font-size: 11px; font-weight: 700;
	text-transform: uppercase; letter-spacing: .5px; color: var(--text);
	border-bottom: 1px solid var(--border); flex-shrink: 0;
	display: flex; align-items: center; gap: 4px;
}
.badge {
	background: var(--surface-em); color: var(--text-mid); font-size: 10px;
	padding: 1px 6px; border-radius: 99px; font-weight: 700;
	margin-right: auto;
}
.icon-btn, .add-btn {
	background: none; border: none; cursor: pointer;
	color: var(--text-mid); font-size: 14px; line-height: 1;
	padding: 0 3px; flex-shrink: 0;
}
.icon-btn { font-size: 12px; font-weight: 700; }
.icon-btn:hover, .add-btn:hover { color: var(--text); }

.add-form {
	padding: 6px 8px; border-bottom: 1px solid var(--border);
	background: var(--bg);
}
.add-cat {
	width: 100%; margin-bottom: 4px; font-size: 11px;
	border: 1px solid var(--border); border-radius: 4px;
	padding: 3px 5px; background: var(--surface); color: var(--text-mid);
}
.add-input {
	width: 100%; border: 1px solid var(--border-input); border-radius: 4px;
	padding: 4px 7px; font-size: 12px; outline: none;
	background: var(--surface); box-shadow: 0 0 0 2px #00000010;
}
.add-hint { font-size: 10px; color: var(--text-muted); margin-top: 3px; }

.rail-list {
	flex: 1; overflow-y: auto;
	background-color: var(--surface-pattern);
	background-image: radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px);
	background-size: 14px 14px;
	padding-top: 4px;
}

.section-head {
	padding: 4px 8px 3px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: var(--text-mid);
	border-bottom: 1px solid var(--border);
	background: var(--surface-muted);
	display: flex; align-items: center; gap: 4px;
}
.overdue-head { color: var(--crimson); background: var(--surface-muted); }
.cat-name { flex: 1; }
.cat-del-btn {
	background: none; border: none; cursor: pointer;
	color: var(--text-faint); font-size: 10px; padding: 0 2px;
	opacity: 0; transition: opacity .1s;
	line-height: 1;
}
.section-head:hover .cat-del-btn { opacity: 1; }
.cat-del-btn:hover { color: var(--text-dark); }
.section-head.drag-over-section { background: var(--border); }

.null-drop { height: 4px; background: transparent; transition: height .1s, background .1s; }
.null-drop.drag-over-section { height: 14px; background: var(--border); }

.del-confirm { display: flex; gap: 3px; align-items: center; }
.del-yes, .del-no {
	font-size: 10px; border-radius: 3px; border: 1px solid;
	padding: 1px 5px; cursor: pointer; line-height: 1.4;
}
.del-yes { background: var(--bg); border-color: var(--border-mid); color: var(--text-dark); }
.del-yes:hover { background: var(--surface-em); }
.del-no  { background: var(--bg); border-color: var(--border); color: var(--text-subtle); }
.del-no:hover  { background: var(--surface-muted); }

.empty {
	padding: 16px 12px; font-size: 12px; color: var(--text-faint); text-align: center;
}

.rail-footer {
	padding: 8px 10px; border-top: 1px solid var(--border); flex-shrink: 0;
}
.btn-roll {
	width: 100%; padding: 6px 10px; font-size: 11px; font-weight: 600;
	background: var(--surface); border: 1px solid var(--border);
	border-radius: 5px; cursor: pointer; color: var(--text-mid);
}
.btn-roll:hover { background: var(--surface-muted); }

:global(#backlog-rail .task-item) { padding-right: 38px; }
:global(#backlog-rail .task-dur) {
	position: absolute;
	top: 5px;
	right: 8px;
	font-size: 9px;
	background: var(--surface-em);
	color: var(--text-mid);
	padding: 1px 5px;
	border-radius: 3px;
	font-weight: 600;
}
</style>
