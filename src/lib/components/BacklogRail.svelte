<script lang="ts">
	import type { Task } from '$lib/types.js';
	import { moveTask, addTask, toggleStar, addCategoryToFile, deleteCategoryFromFile } from '$lib/state.svelte.js';

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

	const allItems = $derived([...backlog, ...overdue]);

	/** Group backlog tasks by their category, preserving file order. */
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
		return result;
	});

	const categories = $derived(
		[...new Set(backlog.map(t => t.category).filter((c): c is string => !!c))]
	);

	let adding     = $state(false);
	let addValue   = $state('');
	let addCat     = $state('');
	let addInputEl: HTMLInputElement;

	let addingCat  = $state(false);
	let newCatName = $state('');
	let catInputEl: HTMLInputElement;

	let dragOver        = $state(false);
	let catDelConfirm: string | null = $state(null);

	async function rollAll() {
		for (const task of allItems) {
			await moveTask(task, todayFilename);
		}
	}

	function formatDate(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

{#snippet taskItem(task: Task)}
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
					{task.estimateMin % 60 === 0 ? `${task.estimateMin / 60}h` : `${task.estimateMin}m`}
				</span>
			{/if}
			{#if task.date}
				<div><span class="date-tag">{formatDate(task.date)}</span></div>
			{/if}
		</div>
		<button
			class="star-btn"
			class:starred={task.starred}
			onclick={() => toggleStar(task)}
			title={task.starred ? 'unstar' : 'star'}
			aria-label={task.starred ? 'unstar task' : 'star task'}
		>&#9733;</button>
	</div>
	{#if task.children.length > 0}
		<div class="bk-children">
			{#each task.children as child}
				<div class="bk-child" class:done={child.done}>{child.title}</div>
			{/each}
		</div>
	{/if}
{/snippet}

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
				{@render taskItem(task)}
			{/each}
		{/if}

		{#each backlogSections as section}
			{#if section.category}
				<div class="section-head">
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
				{@render taskItem(task)}
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

.del-confirm { display: flex; gap: 3px; align-items: center; }
.del-yes, .del-no {
	font-size: 10px; border-radius: 3px; border: 1px solid;
	padding: 1px 5px; cursor: pointer; line-height: 1.4;
}
.del-yes { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
.del-yes:hover { background: #fee2e2; }
.del-no  { background: #fff5f5; border-color: #fecaca; color: #7f1d1d; }
.del-no:hover  { background: #fee2e2; }

.backlog-item {
	padding: 7px 8px; border-bottom: 1px solid #fecaca;
	cursor: grab; display: flex; align-items: flex-start;
	gap: 5px; transition: background .1s;
}
.backlog-item:hover { background: rgba(254,202,202,.2); }

.drag-handle { color: #fca5a5; font-size: 11px; flex-shrink: 0; padding-top: 1px; }
.bk-body { flex: 1; min-width: 0; }
.bk-title { font-size: 12px; font-weight: 500; line-height: 1.3; }
.bk-title.starred { font-weight: 700; }
.bk-dur { font-size: 10px; color: #b91c1c; opacity: .7; margin-left: 4px; }

.star-btn {
	font-size: 12px; background: none; border: none; cursor: pointer;
	color: #fecaca; flex-shrink: 0; padding: 0 1px; line-height: 1;
	padding-top: 2px; transition: color .1s;
	opacity: 0;
}
.backlog-item:hover .star-btn { opacity: 1; }
.star-btn.starred { color: #f59e0b; opacity: 1; }
.star-btn:hover { color: #f59e0b; }

.bk-children {
	padding: 0 8px 4px 26px; border-bottom: 1px solid #fecaca;
	background: rgba(254,226,226,.25);
}
.bk-child {
	font-size: 11px; color: #7f1d1d; padding: 2px 0;
	border-left: 2px solid #fca5a5; padding-left: 6px; margin: 1px 0;
}
.bk-child.done { text-decoration: line-through; opacity: .5; }

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
