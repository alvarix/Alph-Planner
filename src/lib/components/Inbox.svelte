<script lang="ts">
  import {
    app, addTasks, autoSchedule, removeTask, updateTask,
    clearAllTasks, clearSelection,
    deleteSelectedTasks, bulkSetPriority, bulkSetDuration
  } from '$lib/store.svelte.js';
  import { tick } from 'svelte';
  import { parseMarkdown } from '$lib/parser.js';
  import type { Task } from '$lib/types.js';

  let { activeOnMobile = false }: { activeOnMobile?: boolean } = $props();

  // ── Input ────────────────────────────────────────────────────────────────
  let inputText = $state('');

  // ── Inline edit ──────────────────────────────────────────────────────────
  let editingId = $state<string | null>(null);
  let editTitle = $state('');
  let editDur   = $state('');
  let editSess  = $state(1);
  let editPrio  = $state<1|2|3|4>(3);

  // ── Selection ────────────────────────────────────────────────────────────
  let selectedIds  = $state(new Set<string>());
  let selectAllEl  = $state<HTMLInputElement | null>(null);
  let bulkDurText  = $state('');

  const allSelected  = $derived(app.tasks.length > 0 && selectedIds.size === app.tasks.length);
  const someSelected = $derived(selectedIds.size > 0 && selectedIds.size < app.tasks.length);

  // Drive the indeterminate property (can't be set via HTML attribute)
  $effect(() => { if (selectAllEl) selectAllEl.indeterminate = someSelected; });

  const P_COLORS: Record<number, string> = {
    1: 'var(--p1)', 2: 'var(--p2)', 3: 'var(--p3)', 4: 'var(--p4)'
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  function fmtDur(min: number): string {
    if (min >= 60 && min % 60 === 0) return `${min / 60}h`;
    if (min >= 60) return `${(min / 60).toFixed(1)}h`;
    return `${min}m`;
  }

  function parseDurInput(s: string): number {
    const m = s.trim().match(/^(\d*\.?\d+)\s*(h|m)?$/i);
    if (!m) return 30;
    const v = parseFloat(m[1]);
    const unit = (m[2] ?? 'm').toLowerCase();
    return Math.max(15, Math.min(480, unit === 'h' ? Math.round(v * 60) : Math.round(v)));
  }

  // ── Inline edit handlers ─────────────────────────────────────────────────
  function startEdit(task: Task) {
    editingId = task.id;
    editTitle = task.title;
    editDur   = fmtDur(task.sessionMin);
    editSess  = task.sessionsTotal;
    editPrio  = task.priority;
  }

  function saveEdit() {
    if (!editingId) return;
    updateTask(editingId, editTitle.trim() || '(untitled)', parseDurInput(editDur), editSess, editPrio);
    editingId = null;
    clearSelection();
  }

  function cancelEdit() { editingId = null; clearSelection(); }

  function handleEditKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') cancelEdit();
  }

  // Open edit when a session is clicked on the grid
  $effect(() => {
    const id = app.selectedTaskId;
    if (!id) return;
    const task = app.tasks.find(t => t.id === id);
    if (task) {
      startEdit(task);
      tick().then(() => {
        document.querySelector('.task-edit')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  });

  // ── Add tasks ────────────────────────────────────────────────────────────
  function handleAdd() {
    const lines = parseMarkdown(inputText);
    if (addTasks(lines) > 0) inputText = '';
  }

  function handleAddKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAdd(); }
  }

  // ── Selection handlers ───────────────────────────────────────────────────
  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedIds = next; // replace, not mutate — triggers Svelte reactivity
  }

  function toggleSelectAll() {
    if (allSelected) selectedIds = new Set();
    else selectedIds = new Set(app.tasks.map(t => t.id));
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────
  function bulkDelete() {
    const n = selectedIds.size;
    if (!confirm(`Delete ${n} task${n > 1 ? 's' : ''}?`)) return;
    deleteSelectedTasks([...selectedIds]);
    selectedIds = new Set();
  }

  function bulkPriority(p: 1|2|3|4) {
    bulkSetPriority([...selectedIds], p);
    // keep selection so user can chain more bulk actions
  }

  function bulkDuration() {
    const min = parseDurInput(bulkDurText);
    bulkSetDuration([...selectedIds], min);
    bulkDurText = '';
  }

  function handleBulkDurKey(e: KeyboardEvent) {
    if (e.key === 'Enter') bulkDuration();
  }

  function handleClearAll() {
    if (confirm(`Remove all ${app.tasks.length} task${app.tasks.length > 1 ? 's' : ''}?`)) {
      clearAllTasks();
      selectedIds = new Set();
    }
  }
</script>

<svelte:window onkeydown={(e) => {
  if (e.key === 'Escape') {
    if (editingId) cancelEdit();
    else if (selectedIds.size > 0) selectedIds = new Set();
  }
}} />

<aside id="inbox" class:active={activeOnMobile}>
  <div class="rail-head">Inbox</div>

  <div id="input-wrap">
    <textarea
      id="task-input"
      bind:value={inputText}
      onkeydown={handleAddKey}
      placeholder={"draft email .5h x2, p2\nship invoice 1h, p1\ndeep work 2h x3, p3"}
    ></textarea>
    <div class="input-hint">
      title &nbsp;<strong>1h</strong> | <strong>.5h</strong> | <strong>90m</strong>
      &nbsp;[<strong>x2</strong>] &nbsp;[<strong>p1</strong>–<strong>p4</strong>]
    </div>
    <div class="input-actions">
      <button class="btn-add" onclick={handleAdd}>Add <small style="opacity:.5">&#8984;&#8629;</small></button>
      <button class="btn-sched" onclick={() => autoSchedule()}>Auto-schedule</button>
    </div>
  </div>

  <!-- Select bar: select-all + bulk actions -->
  {#if app.tasks.length > 0}
    <div class="select-bar">
      <label class="sel-all-label">
        <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
        <input
          type="checkbox"
          bind:this={selectAllEl}
          checked={allSelected}
          onchange={toggleSelectAll}
        />
        {#if selectedIds.size > 0}
          <span class="sel-count">{selectedIds.size} selected</span>
        {:else}
          <span class="sel-total">{app.tasks.length} task{app.tasks.length !== 1 ? 's' : ''}</span>
        {/if}
      </label>

      {#if selectedIds.size > 0}
        <div class="bulk-actions">
          <button class="bulk-del" onclick={bulkDelete} title="Delete selected">Delete</button>
          <div class="bulk-prio">
            {#each [1,2,3,4] as p}
              <button
                class="bulk-p bp{p}"
                onclick={() => bulkPriority(p as 1|2|3|4)}
                title="Set priority {p}"
              >p{p}</button>
            {/each}
          </div>
          <div class="bulk-dur">
            <input
              class="bulk-dur-in"
              bind:value={bulkDurText}
              onkeydown={handleBulkDurKey}
              placeholder="dur"
              title="Set duration (1h, 30m)"
            />
            <button class="bulk-dur-btn" onclick={bulkDuration} title="Apply duration">→</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <div id="task-list">
    {#each app.tasks as task (task.id)}
      {#if editingId === task.id}
        <!-- Inline edit form -->
        <div class="task-edit">
          <!-- svelte-ignore a11y_autofocus -->
          <input class="edit-title" bind:value={editTitle} onkeydown={handleEditKey} placeholder="title" autofocus />
          <div class="edit-row">
            <input class="edit-field edit-dur"  bind:value={editDur}  onkeydown={handleEditKey} title="Duration (1h, 30m)" placeholder="dur" />
            <input class="edit-field edit-sess" type="number" min="1" max="14" bind:value={editSess} onkeydown={handleEditKey} title="Sessions" />
            <select class="edit-field edit-prio" bind:value={editPrio} onkeydown={handleEditKey}>
              <option value={1}>p1</option>
              <option value={2}>p2</option>
              <option value={3}>p3</option>
              <option value={4}>p4</option>
            </select>
            <button class="edit-save"   onclick={saveEdit}   title="Save (Enter)">&#10003;</button>
            <button class="edit-cancel" onclick={cancelEdit} title="Cancel (Esc)">&#x2715;</button>
          </div>
        </div>
      {:else}
        <!-- Task row -->
        {@const placed = app.sessions.filter(s => s.taskId === task.id).length + task.sessionsDone}
        {@const full   = placed >= task.sessionsTotal}
        {@const isSelected = selectedIds.has(task.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="task-row"
          class:selected={isSelected || app.selectedTaskId === task.id}
          onclick={() => startEdit(task)}
          onkeydown={(e) => e.key === 'Enter' && startEdit(task)}
          role="button"
          tabindex="0"
        >
          <input
            type="checkbox"
            class="task-check"
            checked={isSelected}
            onclick={(e) => { e.stopPropagation(); toggleSelect(task.id); }}
            tabindex="-1"
          />
          <span class="p-dot" style="background:{P_COLORS[task.priority]}"></span>
          <span class="t-name">{task.title}</span>
          <span class="t-dur">{fmtDur(task.sessionMin)}</span>
          <span class="t-prog" class:done={full}>{placed}/{task.sessionsTotal}</span>
          <span
            class="t-del"
            title="Remove"
            role="button"
            tabindex="0"
            onclick={(e) => { e.stopPropagation(); selectedIds = new Set([...selectedIds].filter(x => x !== task.id)); removeTask(task.id); }}
            onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeTask(task.id); } }}
          >&#x2715;</span>
        </div>
      {/if}
    {/each}
  </div>

  {#if app.tasks.length > 0}
    <div class="inbox-footer">
      <button class="btn-clear-all" onclick={handleClearAll}>Clear all tasks</button>
    </div>
  {/if}
</aside>
