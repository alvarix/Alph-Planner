<script lang="ts">
  import { app, setDrag, clearDrag, rollToNextWeek } from '$lib/store.svelte.js';

  /**
   * When true (on mobile), adds .active class so this panel is shown.
   * On desktop the CSS ignores this.
   */
  let { activeOnMobile = false }: { activeOnMobile?: boolean } = $props();

  /**
   * Number of 30-min slots for `min` minutes.
   * @param min - Duration in minutes
   */
  const slotsFor = (min: number) => Math.ceil(min / 30);

  /**
   * Format minutes as a human-readable string.
   * @param min - Duration in minutes
   */
  function fmtDur(min: number): string {
    if (min >= 60 && min % 60 === 0) return `${min / 60}h`;
    if (min >= 60) return `${(min / 60).toFixed(1)}h`;
    return `${min}m`;
  }

  /**
   * Compute capacity percentage.
   * Total slots from hour caps vs slots currently scheduled.
   * Derived so it recalculates when sessions or config changes.
   */
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

  function handleDragEnd() {
    clearDrag();
  }
</script>

<aside id="unscheduled" class:active={activeOnMobile}>
  <div class="rail-head">
    Unscheduled
    <span class="badge" class:on={app.unscheduled.length > 0}>
      {app.unscheduled.length}
    </span>
  </div>

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
  </div>

  <div class="unsched-actions">
    <button class="btn-roll" onclick={() => rollToNextWeek()}>
      Roll to next week &rarr;
    </button>
  </div>

  <div class="cap-bar">
    <div class="cap-lbl">
      <span>Week capacity</span>
      <span>{capPct}%</span>
    </div>
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
