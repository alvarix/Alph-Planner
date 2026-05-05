<script lang="ts">
  import { app, addTasks, autoSchedule, removeTask } from '$lib/store.svelte.js';

  /**
   * When true (on mobile), adds .active class so this panel is shown.
   * On desktop the CSS ignores this.
   */
  let { activeOnMobile = false }: { activeOnMobile?: boolean } = $props();

  /** Text in the textarea */
  let inputText = $state('');

  /** Priority dot colors matching the CSS variables */
  const P_COLORS: Record<number, string> = {
    1: 'var(--p1)',
    2: 'var(--p2)',
    3: 'var(--p3)',
    4: 'var(--p4)'
  };

  /**
   * Format session minutes as a human-readable duration string.
   * @param min - Duration in minutes
   */
  function fmtDur(min: number): string {
    if (min >= 60 && min % 60 === 0) return `${min / 60}h`;
    if (min >= 60) return `${(min / 60).toFixed(1)}h`;
    return `${min}m`;
  }

  /** Handle the Add button or Cmd+Enter shortcut */
  function handleAdd() {
    const lines = inputText.split('\n').filter(l => l.trim());
    const added = addTasks(lines);
    if (added > 0) {
      inputText = '';
    }
  }

  /**
   * Intercept Cmd+Enter inside the textarea to add tasks.
   * @param e - Keyboard event
   */
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAdd();
    }
  }
</script>

<aside id="inbox" class:active={activeOnMobile}>
  <div class="rail-head">Inbox</div>

  <div id="input-wrap">
    <textarea
      id="task-input"
      bind:value={inputText}
      onkeydown={handleKeydown}
      placeholder={"draft email .5h x2, p2\nship invoice 1h, p1\ndeep work 2h x3, p3"}
    ></textarea>

    <div class="input-hint">
      title &nbsp;<strong>1h</strong> | <strong>.5h</strong> | <strong>90m</strong>
      &nbsp;[<strong>x2</strong>] &nbsp;[<strong>p1</strong>–<strong>p4</strong>]
    </div>

    <div class="input-actions">
      <button class="btn-add" onclick={handleAdd}>
        Add <small style="opacity:.5">&#8984;&#8629;</small>
      </button>
      <button class="btn-sched" onclick={() => autoSchedule()}>
        Auto-schedule
      </button>
    </div>
  </div>

  <div id="task-list">
    {#each app.tasks as task (task.id)}
      {@const placed = app.sessions.filter(s => s.taskId === task.id).length + task.sessionsDone}
      {@const full = placed >= task.sessionsTotal}
      <div class="task-row">
        <span class="p-dot" style="background:{P_COLORS[task.priority]}"></span>
        <span class="t-name" title={task.title}>{task.title}</span>
        <span class="t-dur">{fmtDur(task.sessionMin)}</span>
        <span class="t-prog" class:done={full}>{placed}/{task.sessionsTotal}</span>
        <span
          class="t-del"
          title="Remove"
          role="button"
          tabindex="0"
          onclick={() => removeTask(task.id)}
          onkeydown={(e) => e.key === 'Enter' && removeTask(task.id)}
        >&#x2715;</span>
      </div>
    {/each}
  </div>
</aside>
