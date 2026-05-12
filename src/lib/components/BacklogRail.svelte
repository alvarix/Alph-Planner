<script lang="ts">
	import type { Task } from '$lib/types.js';
	import { moveTask, addTask } from '$lib/state.svelte.js';

	let {
		backlog,
		overdue,
		todayFilename,
		ondragstart,
	}: {
		backlog:       Task[];
		overdue:       Task[];
		todayFilename: string;
		ondragstart?:  (task: Task) => void;
	} = $props();

	const allItems = $derived([...backlog, ...overdue]);

	const categories = $derived(
		[...new Set(backlog.map(t => t.category).filter((c): c is string => !!c))]
	);

	let adding     = $state(false);
	let addValue   = $state('');
	let addCat     = $state('');
	let addInputEl: HTMLInputElement;

	async function rollAll() {
		for (const task of allItems) {
			await moveTask(task, todayFilename);
		}
	}

	function formatDate(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	/** Build raw markdown line from terse input. */
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

	$effect(() => {
		if (adding) addInputEl?.focus();
	});
</script>

<aside id="backlog-rail">
	<div class="rail-head">
		Backlog
		{#if allItems.length > 0}
			<span class="badge">{allItems.length}</span>
		{/if}
		<button class="add-btn" onclick={() => (adding = !adding)} title="Add to backlog">+</button>
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
			{#if task.children.length > 0}
				<div class="bk-children">
					{#each task.children as child}
						<div class="bk-child" class:done={child.done}>{child.title}</div>
					{/each}
				</div>
			{/if}
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
.add-btn {
	background: none; border: none; cursor: pointer;
	color: #b91c1c; font-size: 16px; line-height: 1;
	padding: 0 2px; margin-left: auto;
}
.add-btn:hover { color: #7f1d1d; }

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

.bk-children {
	padding: 0 10px 4px 28px; border-bottom: 1px solid #fecaca;
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
