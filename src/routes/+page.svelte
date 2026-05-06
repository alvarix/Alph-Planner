<script lang="ts">
  import { onMount } from 'svelte';
  import { app, autoSchedule, syncUidCounter } from '$lib/store.svelte.js';
  import { weekRangeLabel } from '$lib/dates.js';
  import { saveState, loadState } from '$lib/persistence.js';
  import { fetchWeek } from '$lib/weather.js';
  import Inbox from '$lib/components/Inbox.svelte';
  import WeekGrid from '$lib/components/WeekGrid.svelte';
  import Unscheduled from '$lib/components/Unscheduled.svelte';
  import ConfigDrawer from '$lib/components/ConfigDrawer.svelte';
  import Toast from '$lib/components/Toast.svelte';

  /** Mobile tab state */
  let activeTab = $state<'grid' | 'inbox' | 'unsched'>('grid');

  /** Config drawer open state — bound to ConfigDrawer's `open` prop */
  let configOpen = $state(false);

  const weekLabel = $derived(weekRangeLabel(app.weekOffset));

  function shiftWeek(dir: -1 | 0 | 1) {
    if (dir === 0) app.weekOffset = 0;
    else app.weekOffset += dir;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  onMount(() => {
    const saved = loadState();
    if (saved) {
      if (saved.tasks) app.tasks = saved.tasks;
      if (saved.sessions) app.sessions = saved.sessions;
      if (saved.unscheduled) app.unscheduled = saved.unscheduled;
      if ((saved as any).done) app.done = (saved as any).done;
      if (saved.config) app.config = saved.config;
      // Advance uid counter past any loaded ids to avoid collisions
      const allIds = [
        ...app.tasks.map(t => t.id),
        ...app.sessions.map(s => s.id),
        ...app.unscheduled.map(u => u.id),
        ...app.config.blockoffs.map(b => b.id)
      ];
      syncUidCounter(allIds);
    } else {
      autoSchedule();
    }

    // Non-blocking weather fetch; re-fetches when week changes via $effect below.
    fetchWeek().then(w => { app.weather = w; });
  });

  // Re-fetch weather when navigating to a different week.
  $effect(() => {
    void app.weekOffset;
    fetchWeek().then(w => { app.weather = w; });
  });

  // Switch to inbox tab when a session is clicked on mobile.
  $effect(() => {
    if (app.selectedTaskId) activeTab = 'inbox';
  });

  // Persist state after every reactive update.
  // Accessing array .length and config registers them as dependencies.
  $effect(() => {
    void app.tasks.length;
    void app.sessions.length;
    void app.unscheduled.length;
    void app.done.length;
    void app.config;
    saveState(app);
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (
      e.key === 'n' &&
      !e.metaKey &&
      !e.ctrlKey &&
      target.tagName !== 'TEXTAREA' &&
      target.tagName !== 'INPUT'
    ) {
      activeTab = 'inbox';
      // Small delay lets the tab switch render before focus
      setTimeout(() => {
        const ta = document.getElementById('task-input');
        if (ta) ta.focus();
      }, 50);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div id="topbar">
  <h1>Alph-Planner</h1>
  <span class="vtag">v0.1</span>
  <span id="week-label">{weekLabel}</span>

  <div class="week-nav">
    <button class="btn-nav" onclick={() => shiftWeek(-1)}>&#8592;</button>
    <button class="btn-nav" onclick={() => shiftWeek(0)}>Today</button>
    <button class="btn-nav" onclick={() => shiftWeek(1)}>&#8594;</button>
  </div>

  <button
    class="btn-nav"
    style="font-size:15px;padding:3px 8px;"
    title="Config"
    onclick={() => (configOpen = true)}
  >&#9881;</button>
</div>

<div id="main">
  <!--
    On desktop all three panels are side-by-side (flex row).
    On mobile (max-width:640px) the CSS positions them absolute/inset,
    and the .active class shows only the current panel.
  -->
  <Inbox activeOnMobile={activeTab === 'inbox'} />
  <WeekGrid activeOnMobile={activeTab === 'grid'} />
  <Unscheduled activeOnMobile={activeTab === 'unsched'} />
</div>

<!-- Mobile tab bar (display:none on desktop) -->
<div id="tab-bar">
  <button
    class="tab-btn"
    class:active={activeTab === 'grid'}
    onclick={() => (activeTab = 'grid')}
    data-tab="grid"
  >
    <span class="tab-icon">&#128197;</span>
    Week
  </button>
  <button
    class="tab-btn"
    class:active={activeTab === 'inbox'}
    onclick={() => (activeTab = 'inbox')}
    data-tab="inbox"
  >
    <span class="tab-icon">&#9998;</span>
    Tasks
  </button>
  <button
    class="tab-btn"
    class:active={activeTab === 'unsched'}
    onclick={() => (activeTab = 'unsched')}
    data-tab="unsched"
  >
    <span class="tab-icon">&#9783;</span>
    Overflow
    <span class="tab-dot" class:on={app.unscheduled.length > 0}></span>
  </button>
</div>

<ConfigDrawer bind:open={configOpen} />
<Toast />
