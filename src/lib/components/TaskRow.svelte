<script lang="ts">
	import type { Task } from '$lib/types.js';
	import { toggleTask, toggleChild, toggleStar, deleteTask, editTaskTitle, addSubtask } from '$lib/state.svelte.js';

	/** Color palette for subtask group accents — index auto-assigned by parent. */
	const GROUP_COLORS = [
		{ border: '#a8a39d', bg: '#f2f1ef' },
		{ border: '#bfbab4', bg: '#eeede9' },
		{ border: '#9d9892', bg: '#f5f4f2' },
		{ border: '#b3ada7', bg: '#efeeed' },
		{ border: '#928d87', bg: '#f0efec' },
	];

	let {
		task,
		colorIndex = null,
		minHeight  = null,
		ondragstart,
		ondragend,
	}: {
		task: Task;
		colorIndex?: number | null;
		minHeight?:  number | null;
		ondragstart?: (e: DragEvent, task: Task) => void;
		ondragend?:   (e: DragEvent) => void;
	} = $props();

	let confirmDelete   = $state(false);
	let editing         = $state(false);
	let editValue       = $state('');
	let editInputEl:    HTMLInputElement;
	let addingSubtask   = $state(false);
	let newSubtaskValue = $state('');
	let newSubtaskEl:   HTMLInputElement;

	function startEdit() {
		editValue = task.title;
		editing   = true;
	}

	async function commitEdit() {
		editing = false;
		if (editValue.trim() && editValue.trim() !== task.title) {
			await editTaskTitle(task, editValue.trim());
		}
	}

	function handleEditKey(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
		if (e.key === 'Escape') { editing = false; }
	}

	async function commitNewSubtask() {
		addingSubtask = false;
		const val = newSubtaskValue.trim();
		newSubtaskValue = '';
		if (val) await addSubtask(task, val);
	}

	function handleSubtaskKey(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); commitNewSubtask(); }
		if (e.key === 'Escape') { addingSubtask = false; newSubtaskValue = ''; }
	}

	$effect(() => { if (editing) editInputEl?.focus(); });
	$effect(() => { if (addingSubtask) newSubtaskEl?.focus(); });

	const color = $derived(
		colorIndex !== null ? GROUP_COLORS[colorIndex % GROUP_COLORS.length] : null
	);

	function formatDur(min: number): string {
		return min % 60 === 0 ? `${min / 60}h` : min >= 60 ? `${(min / 60).toFixed(1)}h` : `${min}m`;
	}
</script>

<div
	class="task-item"
	class:done={task.done}
	class:has-color={color}
	style={[
		color     ? `border-left: 3px solid ${color.border}; padding-left: 5px;` : '',
		minHeight ? `min-height: ${minHeight}px;` : '',
	].join('')}
	role="listitem"
	draggable="true"
	ondragstart={(e) => ondragstart?.(e, task)}
	ondragend={(e) => ondragend?.(e)}
>
	<!-- Main row: handle + checkbox + title + duration -->
	<div class="task-main">
		<span class="drag-handle">&#8942;&#8942;</span>
		<input type="checkbox" checked={task.done} onchange={() => toggleTask(task)} />
		<div class="task-body">
			{#if editing}
				<input
					bind:this={editInputEl}
					bind:value={editValue}
					class="edit-input"
					onkeydown={handleEditKey}
					onblur={commitEdit}
				/>
			{:else}
				<span
					class="task-title"
					class:starred={task.starred}
					ondblclick={startEdit}
					title="Double-click to edit"
				>{task.title}</span>
			{/if}
			{#if task.estimateMin}
				<span class="task-dur">{formatDur(task.estimateMin)}</span>
			{/if}
		</div>
	</div>

	<!-- Subtask preview: always visible when children exist -->
	{#if task.children.length > 0}
		<ul class="subtask-preview">
			{#each task.children as child}
				<li class:done={child.done}>
					<input type="checkbox" checked={child.done} onchange={() => toggleChild(task, child)} />
					<span>{child.title}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<!-- Inline add-subtask input -->
	{#if addingSubtask}
		<div class="new-subtask-row">
			<input
				bind:this={newSubtaskEl}
				bind:value={newSubtaskValue}
				class="new-subtask-input"
				placeholder="subtask..."
				onkeydown={handleSubtaskKey}
				onblur={commitNewSubtask}
			/>
		</div>
	{/if}

	<!-- Controls strip: hover-reveal. Star stays visible when starred. -->
	<div class="controls-strip">
		<button
			class="star-btn"
			class:starred={task.starred}
			onclick={() => toggleStar(task)}
			title={task.starred ? 'unstar' : 'star'}
			aria-label={task.starred ? 'unstar task' : 'star task'}
		>&#9733;</button>
		<button
			class="add-sub-btn"
			onclick={() => (addingSubtask = true)}
			title="Add subtask"
			aria-label="Add subtask"
		>+ subtask</button>
		{#if confirmDelete}
			<span class="del-confirm">
				<button class="del-yes" onclick={async () => { await deleteTask(task); confirmDelete = false; }}>del</button>
				<button class="del-no"  onclick={() => (confirmDelete = false)}>no</button>
			</span>
		{:else}
			<button
				class="del-btn"
				onclick={() => (confirmDelete = true)}
				title="Delete task"
				aria-label="Delete task"
			>&#x2715;</button>
		{/if}
	</div>
</div>

<style>
.task-item {
	padding: 5px 6px 2px 4px;
	border: 1px solid #dddad5;
	border-radius: 4px;
	background: #fff;
	margin: 0 6px 10px;
	position: relative; cursor: default; transition: background .08s;
}
.task-item:hover { background: rgba(0,0,0,.02); }
.task-item.done { opacity: .55; }
.task-item.done .task-title { text-decoration: line-through; color: #8a8680; }

.task-main {
	display: flex; align-items: flex-start; gap: 6px;
}

.task-body {
	flex: 1; min-width: 0;
	display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap;
}

.drag-handle {
	color: #c0bab4; font-size: 12px; cursor: grab;
	flex-shrink: 0; padding-top: 2px; line-height: 1; transition: color .1s;
}
.task-item:hover .drag-handle { color: #8a8680; }

.task-main input[type=checkbox] {
	flex-shrink: 0; width: 14px; height: 14px; margin-top: 2px;
	accent-color: #555; cursor: pointer;
}

.task-title { font-size: 12px; flex: 1; line-height: 1.4; cursor: default; }
.task-title.starred { font-weight: 700; }

.edit-input {
	flex: 1; font-size: 12px; border: 1px solid #888;
	border-radius: 3px; padding: 1px 5px; outline: none;
	box-shadow: 0 0 0 2px #00000012;
}

.task-dur { font-size: 10px; color: #8a8680; flex-shrink: 0; }

/* Subtask preview */
.subtask-preview {
	list-style: none; margin: 2px 0 0 26px; padding: 0;
}
.subtask-preview li {
	display: flex; align-items: center; gap: 4px; padding: 1px 0;
}
.subtask-preview li input[type=checkbox] {
	width: 11px; height: 11px; flex-shrink: 0;
	accent-color: #555; cursor: pointer; margin: 0;
}
.subtask-preview li span { font-size: 11px; color: #555; line-height: 1.3; }
.subtask-preview li.done span { text-decoration: line-through; color: #8a8680; }

/* Add-subtask inline input */
.new-subtask-row { margin: 2px 0 2px 26px; }
.new-subtask-input {
	font-size: 11px; border: 1px solid #888;
	border-radius: 3px; padding: 1px 5px; outline: none;
	box-shadow: 0 0 0 2px #00000012;
	width: 100%; box-sizing: border-box;
}

/* Controls strip */
.controls-strip {
	display: flex; align-items: center; gap: 3px;
	padding: 1px 0 2px 26px; min-height: 20px;
}

/* All strip controls hidden until hover */
.star-btn, .add-sub-btn, .del-btn {
	opacity: 0; transition: opacity .1s, color .1s;
}
.task-item:hover .star-btn,
.task-item:hover .add-sub-btn,
.task-item:hover .del-btn { opacity: 1; }

/* Starred icon always visible */
.star-btn.starred { opacity: 1; }

.star-btn {
	font-size: 12px; background: none; border: none; cursor: pointer;
	color: #c0bab4; flex-shrink: 0; padding: 0 1px; line-height: 1;
}
.star-btn.starred { color: #B8932A; }
.star-btn:hover { color: #B8932A; }

.add-sub-btn {
	font-size: 10px; background: none; border: 1px solid #dddad5;
	border-radius: 3px; cursor: pointer; color: #8a8680;
	padding: 0 4px; line-height: 1.6;
	transition: color .1s, border-color .1s, opacity .1s;
}
.add-sub-btn:hover { color: #1c1c1b; border-color: #8a8680; }

.del-btn {
	font-size: 10px; background: none; border: none; cursor: pointer;
	color: #c0bab4; flex-shrink: 0; padding: 0 2px; line-height: 1;
}
.del-btn:hover { color: #333; }

.del-confirm { display: flex; gap: 3px; align-items: center; flex-shrink: 0; }
.del-yes, .del-no {
	font-size: 10px; border-radius: 3px; border: 1px solid;
	padding: 1px 5px; cursor: pointer; line-height: 1.4; opacity: 1;
}
.del-yes { background: #f0efec; border-color: #c0bab4; color: #333; }
.del-yes:hover { background: #e8e5e0; }
.del-no  { background: #f4f3f1; border-color: #dddad5; color: #6a6560; }
.del-no:hover  { background: #eeece8; }
</style>
