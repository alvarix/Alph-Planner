<script lang="ts">
  import { app, applyConfig, showToast } from '$lib/store.svelte.js';
  import { exportJSON, importJSON } from '$lib/persistence.js';
  import { uid } from '$lib/store.svelte.js';
  import type { Config, DayKey, RecurKey } from '$lib/types.js';

  /**
   * In Svelte 5 runes mode, component methods are exposed via $props() with
   * a snippet/callback approach OR by keeping state in the store.
   * We use a simple prop-driven open state: parent passes open=true to show.
   *
   * `open` is a bindable prop so the parent can also read/write it.
   */
  let { open = $bindable(false) }: { open?: boolean } = $props();

  const DAY_LABELS: Record<string, string> = {
    weekday: 'Weekdays', weekend: 'Weekends',
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri',
    sat: 'Sat', sun: 'Sun'
  };

  const WEEKDAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const WEEKENDS: DayKey[] = ['sat', 'sun'];

  /**
   * Local draft config — only pushed to app state when user clicks Apply.
   * Prevents half-changed configs from triggering re-schedules.
   */
  let draft = $state<Config>(structuredClone(app.config));

  // Sync draft from live config whenever the drawer opens
  $effect(() => {
    if (open) draft = structuredClone(app.config);
  });

  // New block-off form fields
  let boLabel = $state('');
  let boDay = $state<RecurKey>('weekday');
  let boStart = $state('12:00');
  let boEnd = $state('13:00');

  /**
   * Time option strings from 06:00 to 22:00 in 30-min steps.
   */
  const timeOptions: string[] = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 22 && m > 0) break;
      timeOptions.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }

  /**
   * Convert "HH:MM" to a slot index relative to 9am (DAY_START).
   * @param hhmm - Time string like "12:00"
   */
  function timeToSlot(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return (h * 60 + m - 9 * 60) / 30;
  }

  /**
   * Convert slot index back to "HH:MM" for display.
   * @param slot - Zero-based slot index from 9am
   */
  function slotToTime(slot: number): string {
    const m = 9 * 60 + slot * 30;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  function addBlockoff() {
    if (!boLabel.trim()) return;
    const s = timeToSlot(boStart);
    const e = timeToSlot(boEnd);
    if (e <= s || s < 0) return;
    draft.blockoffs.push({
      id: uid(),
      day: boDay,
      startSlot: s,
      slots: e - s,
      label: boLabel.trim()
    });
    boLabel = '';
  }

  function removeBlockoff(id: string) {
    draft.blockoffs = draft.blockoffs.filter(b => b.id !== id);
  }

  function handleApply() {
    if (!draft.weekendsEnabled) {
      draft.hoursPerDay.sat = 0;
      draft.hoursPerDay.sun = 0;
    }
    applyConfig(structuredClone(draft));
    open = false;
    showToast('Config applied');
  }

  function handleExport() {
    exportJSON(app);
    showToast('Exported');
  }

  async function handleImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = await importJSON(file);
      if (data.tasks) app.tasks = data.tasks;
      if (data.sessions) app.sessions = data.sessions;
      if (data.unscheduled) app.unscheduled = data.unscheduled;
      if (data.config) app.config = data.config;
      showToast('Imported');
      open = false;
    } catch {
      showToast('Invalid JSON', true);
    }
    input.value = '';
  }

  function handleReset() {
    if (!confirm('Reset everything? This clears all tasks and saved data.')) return;
    localStorage.removeItem('alph-v0');
    app.tasks = [];
    app.sessions = [];
    app.unscheduled = [];
    app.config = {
      hoursPerDay: { mon: 6, tue: 6, wed: 6, thu: 6, fri: 4, sat: 0, sun: 0 },
      weekendsEnabled: false,
      blockoffs: [{ id: uid(), day: 'weekday', startSlot: 6, slots: 2, label: 'lunch' }]
    };
    showToast('Reset');
    open = false;
  }
</script>

<!-- Click-outside overlay -->
<div
  id="cfg-overlay"
  class:open
  onclick={() => (open = false)}
  role="presentation"
></div>

<!-- Drawer panel -->
<div id="cfg-drawer" class:open>
  <div class="cfg-head">
    Configuration
    <button class="cfg-close" onclick={() => (open = false)}>&#x2715;</button>
  </div>

  <!-- Hours per day (weekdays) -->
  <div class="cfg-section">
    <div class="cfg-stitle">Hours per day</div>
    <div class="hours-grid">
      {#each WEEKDAYS as d}
        <div class="hour-cell">
          <label for="h-{d}">{DAY_LABELS[d]}</label>
          <input
            id="h-{d}"
            class="hour-input"
            type="number"
            min="0"
            max="16"
            step="0.5"
            bind:value={draft.hoursPerDay[d]}
          />
        </div>
      {/each}
    </div>
  </div>

  <!-- Weekend toggle + hours -->
  <div class="cfg-section">
    <div class="toggle-row">
      Weekends
      <label class="sw">
        <input type="checkbox" bind:checked={draft.weekendsEnabled} />
        <span class="sw-track"></span>
      </label>
    </div>
    {#if draft.weekendsEnabled}
      <div class="hours-grid">
        {#each WEEKENDS as d}
          <div class="hour-cell">
            <label for="h-we-{d}">{DAY_LABELS[d]}</label>
            <input
              id="h-we-{d}"
              class="hour-input"
              type="number"
              min="0"
              max="16"
              step="0.5"
              bind:value={draft.hoursPerDay[d]}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Block-offs -->
  <div class="cfg-section">
    <div class="cfg-stitle">Block-offs</div>

    <div class="bo-list">
      {#each draft.blockoffs as bo (bo.id)}
        <div class="bo-row">
          <span class="bo-name">{bo.label}</span>
          <span class="bo-day-lbl">{DAY_LABELS[bo.day] ?? bo.day}</span>
          <span class="bo-time-lbl">
            {slotToTime(bo.startSlot)}–{slotToTime(bo.startSlot + bo.slots)}
          </span>
          <button class="bo-del" onclick={() => removeBlockoff(bo.id)}>&#x2715;</button>
        </div>
      {/each}
    </div>

    <div class="add-bo">
      <input
        class="add-bo-full"
        placeholder="label (e.g. lunch)"
        bind:value={boLabel}
      />
      <select bind:value={boDay}>
        <option value="weekday">Every weekday</option>
        <option value="weekend">Every weekend</option>
        <option value="mon">Monday</option>
        <option value="tue">Tuesday</option>
        <option value="wed">Wednesday</option>
        <option value="thu">Thursday</option>
        <option value="fri">Friday</option>
        <option value="sat">Saturday</option>
        <option value="sun">Sunday</option>
      </select>
      <select bind:value={boStart}>
        {#each timeOptions as t}
          <option value={t}>{t}</option>
        {/each}
      </select>
      <select bind:value={boEnd}>
        {#each timeOptions as t}
          <option value={t}>{t}</option>
        {/each}
      </select>
      <button class="btn-add-bo add-bo-full" onclick={addBlockoff}>
        + Add block-off
      </button>
    </div>
  </div>

  <!-- Footer -->
  <div class="cfg-footer">
    <button class="btn-apply" onclick={handleApply}>Apply &amp; re-schedule</button>

    <div class="cfg-footer-row">
      <button class="btn-sched" onclick={handleExport}>Export JSON</button>
      <label class="btn-sched" style="text-align:center;cursor:pointer;">
        Import JSON
        <input
          type="file"
          accept=".json"
          style="display:none"
          onchange={handleImport}
        />
      </label>
    </div>

    <button class="btn-danger" onclick={handleReset}>Reset everything</button>
  </div>
</div>
