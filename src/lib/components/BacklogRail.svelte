<script lang="ts">
	import type { Task } from '$lib/types.js';
	import { appState, moveTask, addTask, addCategoryToFile, moveToCategoryInFile, deleteTask } from '$lib/state.svelte.js';
	import { isFolded, toggleFolded, unfoldAll, anyFolded } from '$lib/ui/foldState.js';
	import TaskRow from './TaskRow.svelte';
	import TaskSection from './TaskSection.svelte';

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

	let dragFromIndex    = $state<number | null>(null);
	let dragOverIndex    = $state<number | null>(null);
	let catDragFromIndex = $state<number | null>(null);
	let catDragOverIndex = $state<number | null>(null);

	let foldSignal = $state(0);
	function isCatFolded(cat: string): boolean { foldSignal; return isFolded('Backlog.md', cat); }
	function toggleCatFold(cat: string) { toggleFolded('Backlog.md', cat); foldSignal++; }
	function unfoldAllCats() { unfoldAll('Backlog.md', fileHeaders); foldSignal++; }
	const anyCatFolded = $derived.by(() => { foldSignal; return anyFolded('Backlog.md', fileHeaders); });

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
		{#if anyCatFolded}
			<button class="icon-btn" onclick={unfoldAllCats} title="Unfold all categories">&#x25BD;</button>
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
			{#each overdue as task (task.file + ':' + task.lineRange[0])}
				<TaskRow
					{task}
					{todayFilename}
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

		{#each backlogSections as section (section.category ?? '__none__')}
			<TaskSection
				filename="Backlog.md"
				{section}
				allTasks={backlog}
				{fileHeaders}
				{todayFilename}
				bind:dragFromIndex
				bind:dragOverIndex
				bind:catDragFromIndex
				bind:catDragOverIndex
				bind:sectionDragOver
				bind:catDelConfirm
				isCatFolded={isCatFolded}
				onCatFoldToggle={toggleCatFold}
				onSectionDrop={(cat) => {
					sectionDragOver = undefined; dragOver = false;
					if (dragFromIndex !== null) {
						const dragged = backlog[dragFromIndex];
						if (dragged) moveToCategoryInFile(dragged, cat);
						dragFromIndex = null; dragOverIndex = null;
					} else if (externalDragTask) {
						dropOnSection(externalDragTask, cat);
					}
				}}
				onTaskDragStart={(t) => { ondragstart?.(t); }}
			/>
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

.null-drop { height: 4px; background: transparent; transition: height .1s, background .1s; }
.null-drop.drag-over-section { height: 14px; background: var(--border); }
.overdue-head { color: var(--crimson); }

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
