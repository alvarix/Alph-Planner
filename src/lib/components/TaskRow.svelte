<script lang="ts">
	import type { Task } from '$lib/types.js';
	import { toggleTask, toggleChild, toggleStar, deleteTask, editTaskTitle } from '$lib/state.svelte.js';

	/** Color palette for subtask group accents — index auto-assigned by parent. */
	const GROUP_COLORS = [
		{ border: '#60a5fa', bg: '#eff6ff' }, // blue
		{ border: '#4ade80', bg: '#f0fdf4' }, // green
		{ border: '#a78bfa', bg: '#faf5ff' }, // purple
		{ border: '#fb923c', bg: '#fff7ed' }, // orange
		{ border: '#f472b6', bg: '#fdf2f8' }, // pink
	];

	let {
		task,
		colorIndex = null,
		ondragstart,
		ondragend,
	}: {
		task: Task;
		colorIndex?: number | null;
		ondragstart?: (e: DragEvent, task: Task) => void;
		ondragend?:   (e: DragEvent) => void;
	} = $props();

	let subtasksOpen  = $state(false);
	let editing       = $state(false);
	let editValue     = $state('');
	let editInputEl: HTMLInputElement;

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

	$effect(() => {
		if (editing) editInputEl?.focus();
	});

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
	style={color ? `border-left: 3px solid ${color.border}; padding-left: 5px;` : ''}
	role="listitem"
	draggable="true"
	ondragstart={(e) => ondragstart?.(e, task)}
	ondragend={(e) => ondragend?.(e)}
>
	<span class="drag-handle">&#8942;&#8942;</span>
	<input type="checkbox" checked={task.done} onchange={() => toggleTask(task)} />
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
	<button
		class="star-btn"
		class:starred={task.starred}
		onclick={() => toggleStar(task)}
		title={task.starred ? 'unstar' : 'star'}
		aria-label={task.starred ? 'unstar task' : 'star task'}
	>&#9733;</button>
	<button
		class="del-btn"
		onclick={() => deleteTask(task)}
		title="Delete task"
		aria-label="Delete task"
	>&#x2715;</button>
	{#if task.children.length > 0}
		<button
			class="sub-badge"
			onclick={() => (subtasksOpen = !subtasksOpen)}
			title={subtasksOpen ? 'collapse' : 'expand'}
		>
			{subtasksOpen ? '↑' : '↓'} {task.children.length}
		</button>
	{/if}
</div>

{#if subtasksOpen && task.children.length > 0}
	<div
		class="subtasks"
		style={color ? `border-left: 3px solid ${color.border}; background: ${color.bg};` : ''}
	>
		{#each task.children as child}
			<div class="subtask-row" class:done={child.done}>
				<input type="checkbox" checked={child.done} onchange={() => toggleChild(task, child)} />
				<span class="st-title">{child.title}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
.task-item {
	display: flex; align-items: flex-start; gap: 6px;
	padding: 5px 6px 5px 4px; border-bottom: 1px solid #e2e8f0;
	position: relative; cursor: default; transition: background .08s;
}
.task-item:hover { background: rgba(0,0,0,.02); }
.task-item.done { opacity: .55; }
.task-item.done .task-title { text-decoration: line-through; color: #94a3b8; }

.drag-handle {
	color: #cbd5e1; font-size: 12px; cursor: grab;
	flex-shrink: 0; padding-top: 2px; line-height: 1; transition: color .1s;
}
.task-item:hover .drag-handle { color: #94a3b8; }

input[type=checkbox] {
	flex-shrink: 0; width: 14px; height: 14px; margin-top: 2px;
	accent-color: #0ea5e9; cursor: pointer;
}

.task-title { font-size: 12px; flex: 1; line-height: 1.4; cursor: default; }
.task-title.starred { font-weight: 700; }
.edit-input {
	flex: 1; font-size: 12px; border: 1px solid #0ea5e9;
	border-radius: 3px; padding: 1px 5px; outline: none;
	box-shadow: 0 0 0 2px #bae6fd40;
}
.task-dur { font-size: 10px; color: #94a3b8; flex-shrink: 0; padding-top: 3px; }

.sub-badge {
	font-size: 10px; color: #94a3b8; background: #f8fafc;
	border: 1px solid #e2e8f0; border-radius: 3px;
	padding: 1px 5px; cursor: pointer; flex-shrink: 0;
	font-family: monospace; margin-top: 2px;
}
.sub-badge:hover { border-color: #94a3b8; color: #1e293b; }

.star-btn {
	font-size: 12px; background: none; border: none; cursor: pointer;
	color: #cbd5e1; flex-shrink: 0; padding: 0 1px; line-height: 1;
	padding-top: 2px; transition: color .1s;
}
.star-btn.starred { color: #f59e0b; }
.star-btn:hover { color: #f59e0b; }

.del-btn {
	font-size: 10px; background: none; border: none; cursor: pointer;
	color: #cbd5e1; flex-shrink: 0; padding: 0 2px; line-height: 1;
	opacity: 0; transition: opacity .1s, color .1s;
}
.task-item:hover .del-btn { opacity: 1; }
.del-btn:hover { color: #ef4444; }

.subtasks { border-bottom: 1px solid #e2e8f0; }
.subtask-row {
	display: flex; align-items: center; gap: 6px;
	padding: 4px 6px 4px 20px; border-bottom: 1px solid #e2e8f0;
}
.subtask-row:last-child { border-bottom: none; }
.subtask-row input[type=checkbox] { width: 12px; height: 12px; }
.st-title { font-size: 11px; color: #475569; }
.subtask-row.done .st-title { text-decoration: line-through; color: #94a3b8; }
</style>
