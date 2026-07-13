<script lang="ts">
	import type { Task } from '$lib/types.js';
	import { slide } from 'svelte/transition';
	import TaskRow from './TaskRow.svelte';
	import { reorderFileTasks, reorderFileCategories, moveToCategoryInFile, deleteCategoryFromFile } from '$lib/state.svelte.js';

	let {
		filename,
		section,
		allTasks,
		fileHeaders,
		todayFilename = null,
		dragFromIndex    = $bindable<number | null>(null),
		dragOverIndex    = $bindable<number | null>(null),
		catDragFromIndex = $bindable<number | null>(null),
		catDragOverIndex = $bindable<number | null>(null),
		sectionDragOver  = $bindable<string | null | undefined>(undefined),
		catDelConfirm    = $bindable<string | null>(null),
		isCatFolded,
		onCatFoldToggle,
		onSectionDrop,
		onTaskDragStart,
		colorIndexOf,
		minHeightFor,
	}: {
		filename:          string;
		section:           { category: string | null; tasks: Task[] };
		allTasks:          Task[];
		fileHeaders:       string[];
		todayFilename?:    string | null;
		dragFromIndex?:    number | null;
		dragOverIndex?:    number | null;
		catDragFromIndex?: number | null;
		catDragOverIndex?: number | null;
		sectionDragOver?:  string | null | undefined;
		catDelConfirm?:    string | null;
		isCatFolded:       (cat: string) => boolean;
		onCatFoldToggle:   (cat: string) => void;
		onSectionDrop:     (category: string | null) => void;
		onTaskDragStart?:  (t: Task) => void;
		colorIndexOf?:     (t: Task) => number | null;
		minHeightFor?:     (t: Task) => number;
	} = $props();

	const fileIdx = $derived(section.category ? fileHeaders.indexOf(section.category) : -1);
</script>

{#if section.category}
	<div
		class="cat-drop-zone"
		class:cat-drop-active={catDragOverIndex === fileIdx}
		role="none"
		ondragover={(e) => { if (catDragFromIndex !== null) { e.preventDefault(); e.stopPropagation(); catDragOverIndex = fileIdx; } }}
		ondragleave={() => { catDragOverIndex = null; }}
		ondrop={(e) => {
			e.preventDefault(); e.stopPropagation();
			if (catDragFromIndex !== null) {
				const effectiveTo = catDragFromIndex < fileIdx ? fileIdx - 1 : fileIdx;
				if (catDragFromIndex !== effectiveTo) {
					reorderFileCategories(filename, catDragFromIndex, effectiveTo);
				}
			}
			catDragFromIndex = null; catDragOverIndex = null;
		}}
	></div>
	<div
		class="section-head"
		draggable="true"
		class:drag-over-section={sectionDragOver === section.category}
		ondragstart={(e) => {
			catDragFromIndex = fileIdx;
			e.dataTransfer?.setData('application/cat', section.category!);
			e.stopPropagation();
		}}
		ondragend={() => { catDragFromIndex = null; catDragOverIndex = null; }}
		ondragover={(e) => {
			e.preventDefault(); e.stopPropagation();
			if (catDragFromIndex !== null) { catDragOverIndex = fileIdx; }
			else { sectionDragOver = section.category; }
		}}
		ondragleave={() => { sectionDragOver = undefined; catDragOverIndex = null; }}
		ondrop={(e) => {
			e.preventDefault(); e.stopPropagation();
			if (catDragFromIndex !== null) {
				const effectiveTo = catDragFromIndex < fileIdx ? fileIdx - 1 : fileIdx;
				if (catDragFromIndex !== effectiveTo) {
					reorderFileCategories(filename, catDragFromIndex, effectiveTo);
				}
				catDragFromIndex = null; catDragOverIndex = null;
			} else {
				onSectionDrop(section.category);
			}
		}}
	>
		<button
			class="cat-fold-btn"
			class:folded={isCatFolded(section.category!)}
			onclick={(e) => { e.stopPropagation(); onCatFoldToggle(section.category!); }}
			title="Toggle fold"
		>&#8250;</button>
		<span class="cat-name">{section.category}</span>
		{#if isCatFolded(section.category!)}
			{@const total = section.tasks.reduce((n, t) => n + 1 + t.children.length, 0)}
			<span class="fold-count">{total}</span>
		{/if}
		{#if catDelConfirm === section.category}
			<span class="cat-del-confirm">
				<button class="cat-del-yes" onclick={async () => {
					await deleteCategoryFromFile(filename, section.category!);
					catDelConfirm = null;
				}}>del</button>
				<button class="cat-del-no" onclick={() => (catDelConfirm = null)}>no</button>
			</span>
		{:else}
			<button class="cat-del-btn" onclick={() => (catDelConfirm = section.category)} title="Delete category">&#x2715;</button>
		{/if}
	</div>
{/if}

{#if !section.category || !isCatFolded(section.category)}
<div transition:slide={{ duration: 150 }}>
{#each section.tasks as task (task.file + ':' + task.lineRange[0])}
	{@const globalIndex = allTasks.indexOf(task)}
	{@const height = minHeightFor ? minHeightFor(task) : undefined}
	<div
		class="drop-target"
		class:active={dragOverIndex === globalIndex}
		role="none"
		ondragover={(e) => { e.preventDefault(); e.stopPropagation(); dragOverIndex = globalIndex; }}
		ondrop={(e) => {
			e.preventDefault(); e.stopPropagation();
			dragOverIndex = null;
			if (dragFromIndex !== null && dragFromIndex !== globalIndex) {
				const dragged = allTasks[dragFromIndex];
				if (dragged && dragged.category !== section.category) {
					moveToCategoryInFile(dragged, section.category);
				} else {
					reorderFileTasks(filename, dragFromIndex, globalIndex);
				}
				dragFromIndex = null;
			}
		}}
	>
		<TaskRow
			{task}
			colorIndex={colorIndexOf ? colorIndexOf(task) : null}
			minHeight={height ?? null}
			{todayFilename}
			ondragstart={(e, t) => {
				dragFromIndex = globalIndex;
				e.dataTransfer?.setData('text/plain', t.title);
				onTaskDragStart?.(t);
			}}
			ondragend={() => { dragFromIndex = null; dragOverIndex = null; }}
		/>
	</div>
{/each}
</div>
{/if}

<style>
.cat-drop-zone {
	height: 3px; background: transparent; transition: height .1s, background .1s;
}
.cat-drop-zone.cat-drop-active { height: 14px; background: var(--border-mid); }

.section-head {
	padding: 4px 8px 3px;
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: .5px; color: var(--text-muted);
	border-bottom: 1px solid var(--border);
	background: var(--bg);
	display: flex; align-items: center; gap: 4px;
	cursor: grab;
}
.section-head:active { cursor: grabbing; }
.section-head.drag-over-section { background: var(--border); }

.cat-fold-btn {
	background: none; border: none; cursor: pointer;
	color: var(--text-muted); font-size: 14px; line-height: 1; padding: 0 2px;
	transform: rotate(90deg); transition: transform .15s;
	flex-shrink: 0;
}
.cat-fold-btn.folded { transform: rotate(0deg); }
.cat-fold-btn:hover { color: var(--text); }

.cat-name { flex: 1; }
.fold-count {
	font-size: 9px; font-weight: 700; color: var(--text-faint);
	background: var(--surface-em); border-radius: 99px;
	padding: 1px 5px; flex-shrink: 0;
}

.cat-del-btn {
	background: none; border: none; cursor: pointer;
	color: var(--text-faint); font-size: 10px; padding: 0 2px;
	opacity: 0; transition: opacity .1s; line-height: 1;
}
.section-head:hover .cat-del-btn { opacity: 1; }
.cat-del-btn:hover { color: var(--text-dark); }

.cat-del-confirm { display: flex; gap: 3px; align-items: center; }
.cat-del-yes, .cat-del-no {
	font-size: 10px; border-radius: 3px; border: 1px solid;
	padding: 1px 5px; cursor: pointer; line-height: 1.4;
}
.cat-del-yes { background: var(--bg); border-color: var(--border-mid); color: var(--text-dark); }
.cat-del-yes:hover { background: var(--surface-em); }
.cat-del-no  { background: var(--bg); border-color: var(--border); color: var(--text-subtle); }
.cat-del-no:hover  { background: var(--surface-muted); }

.drop-target { position: relative; }
.drop-target.active::before {
	content: '';
	position: absolute; top: 0; left: 6px; right: 6px; height: 2px;
	background: var(--text-mid); border-radius: 1px; z-index: 10;
}
</style>
