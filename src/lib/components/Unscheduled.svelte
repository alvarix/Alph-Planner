<script lang="ts">
  import { app, setDrag, clearDrag, rollToNextWeek, deleteDoneItem, clearDoneHistory } from '$lib/store.svelte.js';

  let { activeOnMobile = false }: { activeOnMobile?: boolean } = $props();

  let tab = $state<'overflow' | 'done'>('overflow');

  const slotsFor = (min: number) => Math.ceil(min / 30);

  function fmtDur(min: number): string {
    if (min >= 60 && min % 60 === 0) return `${min / 60}h`;
    if (min >= 60) return `${(min / 60).toFixed(1)}h`;
    return `${min}m`;
  }

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  /**
   * Label for a date relative to today.
   * @param iso - ISO timestamp string
   */
  function dateLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  /**
   * Group done items by calendar date (newest first), each group sorted newest first.
   * Returns array of [dateLabel, items[], totalMin] tuples.
   */
  const doneGroups = $derived(
    (() => {
      const map = new Map<string, { items: typeof app.done; totalMin: number }>();
      for (const d of [...app.done].reverse()) {
        const key = dateLabel(d.doneAt);
        if (!map.has(key)) map.set(key, { items: [], totalMin: 0 });
        const g = map.get(key)!;
        g.items.push(d);
        g.totalMin += d.sessionMin;
      }
      return [...map.entries()];
    })()
  );

  const capPct = $derived(
    (() => {
      const totalSlots = Object.values(app.config.hoursPerDay).reduce((a, b) => a + b, 0) * 2;
      const usedSlots = app.sessions.reduce((a, s) => {
        const t = app.tasks.find(x => x.id === s.taskId);
        return a + (t ? slotsFor(t.sessionMin) : 0);
      }, 0);
      return totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 100) : 0;
    })()
  );

  function handleDragStart(e: DragEvent, id: string, taskMin: number) {
    setDrag({ type: 'unsched', id, slots: slotsFor(taskMin) });
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() { clearDrag(); }

  function handleDeleteDone(id: string, title: string) {
    if (confirm(`Remove "${title}" from done history?`)) deleteDoneItem(id);
  }

  function handleClearDone() {
    if (confirm(`Clear all ${app.done.length} done item${app.done.length > 1 ? 's' : ''}?`)) {
      clearDoneHistory();
    }
  }
</script>

<aside id="unscheduled" class:active={activeOnMobile}>

  <div class="right-tabs">
    <button class="rtab" class:active={tab === 'overflow'} onclick={() => (tab = 'overflow')}>
      Overflow
      {#if app.unscheduled.length > 0}
        <span class="badge on">{app.unscheduled.length}</span>
      {/if}
    </button>
    <button class="rtab" class:active={tab === 'done'} onclick={() => (tab = 'done')}>
      Done
      {#if app.done.length > 0}
        <span class="badge on" style="background:var(--p3-bg);color:var(--p3)">{app.done.length}</span>
      {/if}
    </button>
  </div>

  <!-- Overflow tab -->
  {#if tab === 'overflow'}
    <div id="unsched-list">
      {#each app.unscheduled as u (u.id)}
        {@const task = app.tasks.find(t => t.id === u.taskId)}
        {#if task}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="unsched-card p{task.priority}"
            class:dragging={app.drag?.id === u.id}
            draggable="true"
            ondragstart={(e) => handleDragStart(e, u.id, task.sessionMin)}
            ondragend={handleDragEnd}
          >
            <div>{task.title}</div>
            <div class="u-meta">{fmtDur(task.sessionMin)} &middot; p{task.priority}</div>
          </div>
        {/if}
      {/each}
      {#if app.unscheduled.length === 0}
        <div class="empty-state">All sessions scheduled</div>
      {/if}
    </div>
    <div class="unsched-actions">
      <button class="btn-roll" onclick={() => rollToNextWeek()}>Roll to next week &rarr;</button>
    </div>
  {/if}

  <!-- Done tab — flat list grouped by date -->
  {#if tab === 'done'}
    <div id="done-list">
      {#if doneGroups.length === 0}
        <div class="empty-state">Nothing done yet</div>
      {:else}
        {#each doneGroups as [label, { items, totalMin }]}
          <div class="done-date-group">
            <div class="done-date-head">
              <span>{label}</span>
              <span class="done-date-total">{fmtDur(totalMin)}</span>
            </div>
            {#each items as d (d.id)}
              <div class="done-row">
                <span class="done-title">{d.taskTitle}</span>
                <span class="done-meta">{fmtDur(d.sessionMin)} &middot; {fmtTime(d.doneAt)}</span>
                <button
                  class="done-del"
                  title="Remove from history"
                  onclick={() => handleDeleteDone(d.id, d.taskTitle)}
                >&#x2715;</button>
              </div>
            {/each}
          </div>
        {/each}

        <div class="done-footer">
          <button class="btn-clear-done" onclick={handleClearDone}>Clear history</button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="cap-bar">
    <div class="cap-lbl"><span>Week capacity</span><span>{capPct}%</span></div>
    <div class="cap-track">
      <div
        class="cap-fill"
        class:warn={capPct > 80 && capPct <= 100}
        class:over={capPct > 100}
        style="width:{Math.min(100, capPct)}%"
      ></div>
    </div>
  </div>

</aside>
