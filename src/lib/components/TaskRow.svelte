<script lang="ts">
	import type { Task, ChildTask } from '$lib/types.js';
	import { toggleTask, toggleChild, toggleStar, deleteTask, deleteSubtask, editTaskTitle, editChildTitle, editTaskDuration, addSubtask, completeToToday, completeTask, cancelCompletion, duplicateTask, shouldMoveToToday, appState, archiveTask, moveTask } from '$lib/state.svelte.js';
import { ARCHIVE_FILENAME } from '$lib/types.js';
	import { openInObsidian } from '$lib/obsidian.js';

	/** Color palette for subtask group accents — index auto-assigned by parent. */
	const GROUP_COLORS = [
		{ border: '#aaa', bg: '#f2f2f2' },
		{ border: '#bbb', bg: '#ebebeb' },
		{ border: '#999', bg: '#f5f5f5' },
		{ border: '#b5b5b5', bg: '#eee' },
		{ border: '#929292', bg: '#f0f0f0' },
	];

	let {
		task,
		colorIndex = null,
		minHeight  = null,
		todayFilename = null,
		restorable = false,
		onrestore = null,
		ondragstart,
		ondragend,
	}: {
		task: Task;
		colorIndex?: number | null;
		minHeight?:  number | null;
		todayFilename?: string | null;
		/** Archive view: show a restore-to-backlog button in the controls strip. */
		restorable?: boolean;
		onrestore?:   (() => void) | null;
		ondragstart?: (e: DragEvent, task: Task) => void;
		ondragend?:   (e: DragEvent) => void;
	} = $props();

	let confirmDelete   = $state(false);
	let editing         = $state(false);
	let editValue       = $state('');
	let editInputEl:    HTMLInputElement;
	let editingDur      = $state(false);
	let editDurValue    = $state('');
	let editDurEl:      HTMLInputElement;
	let editingChildIdx = $state<number | null>(null);
	let editChildValue  = $state('');
	let editChildEl:    HTMLInputElement;
	let addingSubtask   = $state(false);
	let newSubtaskValue = $state('');
	let newSubtaskEl:   HTMLInputElement;

	/** Index of the subtask currently showing its delete confirmation. */
	let confirmChildIdx = $state<number | null>(null);

	// ── Obsidian link + hover preview ─────────────────────────────────
	/** Whether the small Obsidian preview popover is showing. */
	let obsidianPreview = $state(false);
	/** Viewport-fixed coordinates for the preview, captured from the button. */
	let previewPos = $state<{ x: number; y: number } | null>(null);

	/**
	 * Open this task's file at the task's line in Obsidian. Reuses the shared
	 * adapter so vault-name handling stays in one place.
	 * @param event - Click event; stops propagation so the row does not toggle.
	 */
	function openTaskInObsidian(event: MouseEvent) {
		event.stopPropagation();
		if (appState.folder.status !== 'ready') return;
		openInObsidian(appState.folder.name, task.file);
	}

	/**
	 * Show the preview above the button. Coordinates are captured as fixed
	 * viewport values so the popover is not clipped by the day column's
	 * scroll container.
	 * @param event - Hover/focus event on the `obl` button.
	 */
	function showPreview(event: Event) {
		const el = event.currentTarget as HTMLElement | null;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const width = 260;
		previewPos = {
			x: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
			y: r.top,
		};
		obsidianPreview = true;
	}

	function hidePreview() {
		obsidianPreview = false;
	}

	/** First ~6 lines of this task block, for the hover preview. */
	const previewLines = $derived(
		[task.raw, ...task.children.map((c) => c.raw)].slice(0, 6),
	);

	// ── Long-press state ───────────────────────────────────────────────
	let longPressTimer:  ReturnType<typeof setTimeout> | null = null;
	const LONG_PRESS_MS = 500;

	/** True when long-press just fired — suppresses the next checkbox onchange. */
	let longPressJustFired = $state(false);

	function startLongPress() {
		longPressJustFired = false;
		longPressTimer = setTimeout(() => {
			longPressJustFired = true;
			longPressTimer = null;
			if (todayFilename && task.file !== todayFilename && shouldMoveToToday(task, todayFilename.replace(/\.md$/, ''))) {
				// Backlog task: complete by moving to today.
				completeToToday(task, todayFilename);
			} else {
				// Fall back to completeTask — its state-layer guard routes
				// backlog tasks to today even without todayFilename.
				completeTask(task);
			}
		}, LONG_PRESS_MS);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	// ── Pending completion state (derived from global map) ────────────
	const taskKey = $derived(`${task.file}:${task.lineRange[0]}`);
	const isPendingComplete = $derived(appState.pendingCompletions.has(taskKey));

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
	$effect(() => { if (editingDur) editDurEl?.focus(); });
	$effect(() => { if (editingChildIdx !== null) editChildEl?.focus(); });
	$effect(() => { if (addingSubtask) newSubtaskEl?.focus(); });

	const color = $derived(
		colorIndex !== null ? GROUP_COLORS[colorIndex % GROUP_COLORS.length] : null
	);

	function formatDur(min: number): string {
		return min % 60 === 0 ? `${min / 60}h` : min >= 60 ? `${(min / 60).toFixed(1)}h` : `${min}m`;
	}

	function startDurEdit() {
		editDurValue = task.estimateMin !== null ? String(task.estimateMin) : '';
		editingDur   = true;
	}

	async function commitDurEdit() {
		editingDur = false;
		const raw = editDurValue.trim();
		if (!raw) {
			if (task.estimateMin !== null) await editTaskDuration(task, null);
			return;
		}
		let minutes: number | null = null;
		const mh = raw.match(/^(\d*\.?\d+)\s*h$/i);
		const mm = raw.match(/^(\d+)\s*m$/i);
		if (mh) minutes = Math.round(parseFloat(mh[1]) * 60);
		else if (mm) minutes = parseInt(mm[1], 10);
		else if (/^\d+$/.test(raw)) minutes = parseInt(raw, 10);
		else return;
		if (minutes !== task.estimateMin) await editTaskDuration(task, minutes);
	}

	function handleDurKey(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); commitDurEdit(); }
		if (e.key === 'Escape') { editingDur = false; }
	}

	function startChildEdit(idx: number) {
		editChildValue  = task.children[idx].title;
		editingChildIdx = idx;
	}

	// ── Backlog/archive button: click → backlog, hold → archive ──────
	let backlogPressTimer: ReturnType<typeof setTimeout> | null = null;
	let backlogLongFired = $state(false);

	/** Hold the bl button ~0.5s to archive instead of moving to backlog.
	 *  No-op for tasks already in the backlog (there, click archives). */
	function startBacklogPress() {
		backlogLongFired = false;
		if (task.file === 'Backlog.md') return;
		backlogPressTimer = setTimeout(() => {
			backlogLongFired = true;
			backlogPressTimer = null;
			archiveTask(task);
		}, LONG_PRESS_MS);
	}

	function cancelBacklogPress() {
		if (backlogPressTimer) { clearTimeout(backlogPressTimer); backlogPressTimer = null; }
	}

	async function handleBacklogClick() {
		if (backlogLongFired) { backlogLongFired = false; return; }
		cancelBacklogPress();
		if (task.file === 'Backlog.md') {
			await archiveTask(task);
		} else {
			await moveTask(task, 'Backlog.md');
		}
	}

	async function commitChildEdit() {
		const idx = editingChildIdx;
		editingChildIdx = null;
		if (idx === null || editChildValue.trim() === '' || editChildValue.trim() === task.children[idx].title) return;
		await editChildTitle(task, task.children[idx], editChildValue.trim());
	}

	/** Delete a subtask after its confirmation step. */
	async function removeChild(child: ChildTask) {
		confirmChildIdx = null;
		await deleteSubtask(task, child);
	}

	function handleChildEditKey(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); commitChildEdit(); }
		if (e.key === 'Escape') { editingChildIdx = null; }
	}
</script>

<div
	class="task-item"
	class:done={task.status === 'done'}
	class:in-progress={task.status === 'in-progress'}
	class:has-color={color}
	class:pending={isPendingComplete}
	style={[
		color     ? `border-left: 3px solid ${color.border}; padding-left: 5px;` : '',
		minHeight ? `min-height: ${minHeight}px;` : '',
	].join('')}
	role="listitem"
	draggable="true"
	ondragstart={(e) => ondragstart?.(e, task)}
	ondragend={(e) => ondragend?.(e)}
	onpointerdown={startLongPress}
	onpointerup={cancelLongPress}
	onpointerleave={cancelLongPress}
	onpointercancel={cancelLongPress}
>
	<!-- Main row: handle + checkbox + title + duration -->
	<div class="task-main">
		<span class="drag-handle">&#8942;&#8942;</span>
		<input
			type="checkbox"
			checked={task.status === 'done'}
			indeterminate={task.status === 'in-progress'}
			onclick={(e) => {
				// Long press already fired — prevent browser from toggling the
				// native checkbox state, which would fight Svelte's binding.
				if (longPressJustFired) { longPressJustFired = false; e.preventDefault(); }
			}}
			onchange={() => {
				// Backlog and overdue tasks: first click → in-progress.
				// Second click (in-progress) → move to today as done.
				if (todayFilename && task.status === 'in-progress' && task.file !== todayFilename
					&& shouldMoveToToday(task, todayFilename.replace(/\.md$/, ''))) {
					completeToToday(task, todayFilename);
				} else if (task.file === 'Backlog.md' && task.status === 'done' && todayFilename) {
					// Clicking a done backlog task un-completes it (moves back to todo in-place).
					toggleTask(task);
				} else {
					toggleTask(task);
				}
			}}
		/>
		{#if isPendingComplete}
			<button
				class="undo-btn"
				onclick={(e) => { e.stopPropagation(); cancelCompletion(task); }}
				title="Undo completion"
				aria-label="Undo completion"
			>undo</button>
		{/if}
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
			{#if editingDur}
				<input
					bind:this={editDurEl}
					bind:value={editDurValue}
					class="edit-dur-input"
					onkeydown={handleDurKey}
					onblur={commitDurEdit}
				/>
			{:else if task.estimateMin}
				<span
					class="task-dur"
					ondblclick={startDurEdit}
					title="Double-click to edit duration"
				>{formatDur(task.estimateMin)}</span>
			{/if}
			{#if !task.estimateMin && !editingDur}
				<span
					class="task-dur-empty"
					ondblclick={startDurEdit}
					title="Double-click to set duration"
				></span>
			{/if}
			{#if task.file === ARCHIVE_FILENAME && task.date}
				<span class="task-arch-date" title="Archived">{task.date}</span>
			{/if}
		</div>
	</div>

	<!-- Subtask preview: always visible when children exist -->
	{#if task.children.length > 0}
		<ul class="subtask-preview">
			{#each task.children as child, idx}
				<li class:done={child.status === 'done'} class:in-progress={child.status === 'in-progress'}>
					<input
						type="checkbox"
						checked={child.status === 'done'}
						indeterminate={child.status === 'in-progress'}
						onchange={() => toggleChild(task, child, todayFilename ?? undefined)}
					/>
					{#if editingChildIdx === idx}
						<input
							bind:this={editChildEl}
							bind:value={editChildValue}
							class="edit-child-input"
							onkeydown={handleChildEditKey}
							onblur={commitChildEdit}
						/>
					{:else}
						<span
							ondblclick={() => startChildEdit(idx)}
							title="Double-click to edit"
						>{child.title}</span>
					{/if}
					{#if confirmChildIdx === idx}
						<span class="child-del-confirm">
							<button class="child-del-yes" onclick={() => removeChild(child)} aria-label="Confirm delete subtask">del</button>
							<button class="child-del-no" onclick={() => (confirmChildIdx = null)} aria-label="Cancel delete subtask">no</button>
						</span>
					{:else}
						<button
							class="child-del-btn"
							onclick={() => (confirmChildIdx = idx)}
							title="Delete subtask"
							aria-label="Delete subtask"
						>&#x2715;</button>
					{/if}
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
		<div
			class="obsidian-wrap"
		>
			<button
				class="obsidian-btn"
				onclick={openTaskInObsidian}
				onmouseenter={showPreview}
				onmouseleave={hidePreview}
				onfocus={showPreview}
				onblur={hidePreview}
				title="Open in Obsidian"
				aria-label="Open task in Obsidian"
			>obl</button>
			{#if obsidianPreview && previewPos}
				<div
					class="obsidian-preview"
					role="tooltip"
					style="left: {previewPos.x}px; top: {previewPos.y}px;"
				>
					<div class="obsidian-preview-file">{task.file}</div>
					<pre class="obsidian-preview-body">{previewLines.join('\n')}</pre>
					{#if task.children.length > previewLines.length - 1}
						<div class="obsidian-preview-more">+{task.children.length - (previewLines.length - 1)} more</div>
					{/if}
				</div>
			{/if}
		</div>
		<button
			class="dup-btn"
			onclick={() => duplicateTask(task)}
			title="Duplicate task"
			aria-label="Duplicate task"
		>dup</button>
		{#if task.file !== ARCHIVE_FILENAME}
			<button
				class="arch-btn"
				onclick={handleBacklogClick}
				onpointerdown={(e) => { e.stopPropagation(); startBacklogPress(); }}
				onpointerup={cancelBacklogPress}
				onpointerleave={cancelBacklogPress}
				onpointercancel={cancelBacklogPress}
				title={task.file === 'Backlog.md' ? 'Move to archive' : 'Short: move to backlog · Hold: archive'}
				aria-label={task.file === 'Backlog.md' ? 'Move to archive' : 'Move to backlog or archive'}
			>{task.file === 'Backlog.md' ? 'arch' : 'bl'}</button>
		{/if}
		{#if restorable}
			<button
				class="arch-btn"
				onclick={() => onrestore?.()}
				title="Restore to backlog"
				aria-label="Restore to backlog"
			>restore</button>
		{/if}
		<button
			class="add-sub-btn"
			onclick={() => (addingSubtask = true)}
			title="Add subtask"
			aria-label="Add subtask"
		>+ sub</button>
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
	border: 1px solid var(--border);
	border-radius: 4px;
	background: var(--surface);
	margin: 0 6px 10px;
	position: relative; cursor: default; transition: background .08s;
}
.task-item:hover { background: rgba(0,0,0,.02); }
.task-item.done { opacity: .55; }
.task-item.done .task-title { text-decoration: line-through; color: var(--text-muted); }
.task-item.in-progress { opacity: .85; background: rgba(0,0,0,.03); }
.task-item.in-progress .task-title { font-style: italic; }

.task-main {
	display: flex; align-items: flex-start; gap: 6px;
}

.task-body {
	flex: 1; min-width: 0;
	display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap;
}

.drag-handle {
	color: var(--text-faint); font-size: 12px; cursor: grab;
	flex-shrink: 0; padding-top: 2px; line-height: 1; transition: color .1s;
}
.task-item:hover .drag-handle { color: var(--text-muted); }

.task-main input[type=checkbox] {
	flex-shrink: 0; width: 14px; height: 14px; margin-top: 2px;
	accent-color: var(--text-mid); cursor: pointer;
}

.task-title { font-size: 12px; flex: 1; line-height: 1.4; cursor: default; }
.task-title.starred { font-weight: 700; }

.edit-input {
	flex: 1; font-size: 12px; border: 1px solid var(--border-input);
	border-radius: 3px; padding: 1px 5px; outline: none;
	box-shadow: 0 0 0 2px #00000012;
}

.task-dur { font-size: 10px; color: var(--text-muted); flex-shrink: 0; cursor: pointer; }
.task-arch-date {
	font-size: 10px; color: var(--text-faint); flex-shrink: 0;
	font-variant-numeric: tabular-nums;
}
.task-dur:hover { color: var(--text); }
.task-dur-empty {
	display: inline-block; width: 24px; height: 14px; flex-shrink: 0;
	cursor: pointer; opacity: 0;
}
.task-item:hover .task-dur-empty { opacity: .3; }
.task-dur-empty:hover { opacity: .6 !important; }
.edit-dur-input {
	font-size: 10px; border: 1px solid var(--border-input);
	border-radius: 3px; padding: 1px 4px; outline: none;
	box-shadow: 0 0 0 2px #00000012; width: 32px; flex-shrink: 0;
}
.edit-child-input {
	flex: 1; font-size: 11px; border: 1px solid var(--border-input);
	border-radius: 3px; padding: 1px 5px; outline: none;
	box-shadow: 0 0 0 2px #00000012;
}

/* Subtask preview */
.subtask-preview {
	list-style: none; margin: 2px 0 0 26px; padding: 0;
}
.subtask-preview li {
	display: flex; align-items: center; gap: 4px; padding: 1px 0;
}
.subtask-preview li input[type=checkbox] {
	width: 11px; height: 11px; flex-shrink: 0;
	accent-color: var(--text-mid); cursor: pointer; margin: 0;
}
.subtask-preview li span { font-size: 11px; color: var(--text-mid); line-height: 1.3; }
.subtask-preview li.done span { text-decoration: line-through; color: var(--text-muted); }
.subtask-preview li.in-progress span { font-style: italic; color: var(--text-dark); }

/* Per-subtask delete: hover-reveal, two-step confirm like the parent task. */
.child-del-btn, .child-del-confirm { opacity: 0; transition: opacity .1s; margin-left: auto; }
.subtask-preview li:hover .child-del-btn,
.subtask-preview li .child-del-confirm { opacity: 1; }
.child-del-btn {
	font-size: 9px; background: none; border: none; cursor: pointer;
	color: var(--text-faint); padding: 0 2px; line-height: 1; flex-shrink: 0;
}
.child-del-btn:hover { color: var(--text-dark); }
.child-del-confirm { display: flex; gap: 3px; align-items: center; flex-shrink: 0; }
.child-del-yes, .child-del-no {
	font-size: 9px; border-radius: 3px; border: 1px solid;
	padding: 0 4px; cursor: pointer; line-height: 1.4;
}
.child-del-yes { background: var(--bg); border-color: var(--border-mid); color: var(--text-dark); }
.child-del-yes:hover { background: var(--surface-em); }
.child-del-no { background: var(--bg); border-color: var(--border); color: var(--text-subtle); }
.child-del-no:hover { background: var(--surface-muted); }

/* Add-subtask inline input */
.new-subtask-row { margin: 2px 0 2px 26px; }
.new-subtask-input {
	font-size: 11px; border: 1px solid var(--border-input);
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
.star-btn, .dup-btn, .add-sub-btn, .del-btn, .obsidian-btn {
	opacity: 0; transition: opacity .1s, color .1s;
}
.task-item:hover .star-btn,
.task-item:hover .dup-btn,
.task-item:hover .obsidian-btn,
.task-item:hover .arch-btn,
.task-item:hover .add-sub-btn,
.task-item:hover .del-btn { opacity: 1; }

/* Obsidian link + hover preview */
.obsidian-wrap { position: relative; display: inline-flex; flex-shrink: 0; }
.obsidian-btn {
	font-size: 10px; background: none; border: 1px solid var(--border);
	border-radius: 3px; cursor: pointer; color: var(--text-muted);
	padding: 0 4px; line-height: 1.6;
	transition: color .1s, border-color .1s, opacity .1s;
}
.obsidian-btn:hover { color: var(--text); border-color: var(--border-input); }
.obsidian-preview {
	position: fixed; z-index: 60;
	transform: translateY(calc(-100% - 4px));
	width: 260px; max-width: calc(100vw - 16px);
	background: var(--surface); border: 1px solid var(--border);
	border-radius: 5px; padding: 5px 7px;
	box-shadow: 0 4px 12px rgba(0,0,0,.1);
	pointer-events: none;
}
.obsidian-preview-file {
	font-size: 9px; font-family: 'SF Mono', 'Menlo', monospace;
	color: var(--text-faint); margin-bottom: 3px;
}
.obsidian-preview-body {
	font-size: 10px; font-family: 'SF Mono', 'Menlo', monospace;
	color: var(--text-mid); line-height: 1.4; white-space: pre-wrap;
	margin: 0; overflow: hidden;
}
.obsidian-preview-more { font-size: 9px; color: var(--text-muted); margin-top: 3px; }

/* Starred icon always visible */
.star-btn.starred { opacity: 1; }

.star-btn {
	font-size: 12px; background: none; border: none; cursor: pointer;
	color: var(--text-faint); flex-shrink: 0; padding: 0 1px; line-height: 1;
}
.star-btn.starred { color: var(--yellow); }
.star-btn:hover { color: var(--yellow); }

.dup-btn {
	font-size: 10px; background: none; border: 1px solid var(--border);
	border-radius: 3px; cursor: pointer; color: var(--text-muted);
	padding: 0 4px; line-height: 1.6;
	transition: color .1s, border-color .1s, opacity .1s;
}
.dup-btn:hover { color: var(--text); border-color: var(--border-input); }

.arch-btn,
.add-sub-btn {
	font-size: 10px; background: none; border: 1px solid var(--border);
	border-radius: 3px; cursor: pointer; color: var(--text-muted);
	padding: 0 4px; line-height: 1.6;
	transition: color .1s, border-color .1s, opacity .1s;
}
.add-sub-btn:hover { color: var(--text); border-color: var(--border-input); }

.del-btn {
	font-size: 10px; background: none; border: none; cursor: pointer;
	color: var(--text-faint); flex-shrink: 0; padding: 0 2px; line-height: 1;
}
.del-btn:hover { color: var(--text-dark); }

.del-confirm { display: flex; gap: 3px; align-items: center; flex-shrink: 0; }
.del-yes, .del-no {
	font-size: 10px; border-radius: 3px; border: 1px solid;
	padding: 1px 5px; cursor: pointer; line-height: 1.4; opacity: 1;
}
.del-yes { background: var(--bg); border-color: var(--border-mid); color: var(--text-dark); }
.del-yes:hover { background: var(--surface-em); }
.del-no  { background: var(--bg); border-color: var(--border); color: var(--text-subtle); }
.del-no:hover  { background: var(--surface-muted); }

.in-progress {
	outline: 1px #f9c0af dashed !important;
    background: var(--surface) !important;
	input {
		    accent-color: var(--crimson) !important;
	}
}

/* ── Pending completion (3-second undo window) ──────────────────────── */
.task-item.pending {
	opacity: 0.7;
	background: linear-gradient(90deg, var(--surface) 0%, #e8f5e9 50%, var(--surface) 100%);
	background-size: 200% 100%;
	animation: pending-pulse 0.8s ease-in-out infinite;
}
.task-item.pending .task-title {
	text-decoration: line-through;
	color: var(--text-muted);
}

@keyframes pending-pulse {
	0%   { background-position: 100% 0; }
	100% { background-position: 0% 0; }
}

.undo-btn {
	font-size: 10px;
	background: var(--surface);
	border: 1px solid var(--border-input);
	border-radius: 3px;
	color: var(--text-muted);
	cursor: pointer;
	padding: 1px 6px;
	line-height: 1.5;
	flex-shrink: 0;
	transition: color .1s, border-color .1s;
}
.undo-btn:hover {
	color: var(--crimson);
	border-color: var(--crimson);
}

</style>
