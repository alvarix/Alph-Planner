<script lang="ts">
  import { app, setDrag, clearDrag, rollToNextWeek } from '$lib/store.svelte.js';

  let { activeOnMobile = false }: { activeOnMobile?: boolean } = $props();

  let tab = $state<'overflow' | 'done'>('overflow');

  const slotsFor = (min: number) => Math.ceil(min / 30);

  function fmtDur(min: number): string {
    if (min >= 60 && min % 60 === 0) return `${min / 60}h`;
    if (min >= 60) return `${(min / 60).toFixed(1)}h`;
    return `${min}m`;
  }

  function fmtTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

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
</script>

<aside id="unscheduled" class:active={activeOnMobile}>

  <!-- Tab toggle header -->
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

  <!-- Done tab -->
  {#if tab === 'done'}
    <div id="done-list">
      {#each [...app.done].reverse() as d (d.id)}
        <div class="done-row">
          <span class="done-title">{d.taskTitle}</span>
          <span class="done-meta">{fmtDur(d.sessionMin)} · {fmtTime(d.doneAt)}</span>
        </div>
      {/each}
      {#if app.done.length === 0}
        <div class="empty-state">Nothing done yet</div>
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
