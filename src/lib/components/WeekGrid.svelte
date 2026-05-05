<script lang="ts">
  import { app, setDrag, clearDrag, moveSession, scheduleUnscheduled, markDone, deleteSess, unscheduleSession } from '$lib/store.svelte.js';
  import type { DayKey } from '$lib/types.js';

  /**
   * When true (on mobile), adds .active class so this panel is shown.
   * On desktop the CSS ignores this.
   */
  let { activeOnMobile = true }: { activeOnMobile?: boolean } = $props();

  const DAY_START = 9;
  const DAY_END = 18;
  const NSLOTS = (DAY_END - DAY_START) * 2; // 18
  const SLOT_H = 40;

  /**
   * Static day descriptors for the week of May 5-11 2026.
   * `today` marks Monday May 5 (today per the env context).
   */
  const DAYS: { key: DayKey; label: string; date: number; iso: string; weekend?: boolean; today?: boolean }[] = [
    { key: 'mon', label: 'Mon', date: 5,  iso: '2026-05-05', today: true },
    { key: 'tue', label: 'Tue', date: 6,  iso: '2026-05-06' },
    { key: 'wed', label: 'Wed', date: 7,  iso: '2026-05-07' },
    { key: 'thu', label: 'Thu', date: 8,  iso: '2026-05-08' },
    { key: 'fri', label: 'Fri', date: 9,  iso: '2026-05-09' },
    { key: 'sat', label: 'Sat', date: 10, iso: '2026-05-10', weekend: true },
    { key: 'sun', label: 'Sun', date: 11, iso: '2026-05-11', weekend: true }
  ];

  /**
   * Convert slot index to HH:MM display string.
   * Slot 0 = 09:00, slot 1 = 09:30, etc.
   * @param slot - Zero-based slot index
   */
  function slotTime(slot: number): string {
    const m = DAY_START * 60 + slot * 30;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  /**
   * Number of 30-min slots required for `min` minutes.
   * @param min - Duration in minutes
   */
  const slotsFor = (min: number) => Math.ceil(min / 30);

  /**
   * Clamp the computed target slot so the block doesn't overflow the day.
   * @param y - offsetY from drag event
   * @param n - height of block in slots
   */
  function clampSlot(y: number, n: number): number {
    return Math.max(0, Math.min(NSLOTS - n, Math.floor(y / SLOT_H)));
  }

  /**
   * Per-column drop hint state.
   * Each day key maps to { slot, n } while dragging over it, or null otherwise.
   */
  /** Session id currently showing the done/remove confirmation buttons. */
  let confirmSess = $state<string | null>(null);

  let hints = $state<Record<DayKey, { slot: number; n: number } | null>>({
    mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null
  });

  /**
   * Get blockoffs that apply to a specific day,
   * expanding 'weekday'/'weekend' patterns.
   * @param key - Day key to check
   */
  function dayBlockoffs(key: DayKey) {
    const WKND: DayKey[] = ['sat', 'sun'];
    return app.config.blockoffs.filter(b =>
      b.day === key ||
      (b.day === 'weekday' && !WKND.includes(key)) ||
      (b.day === 'weekend' && WKND.includes(key))
    );
  }

  /** Get sessions placed on a given day. */
  function daySessions(key: DayKey) {
    return app.sessions.filter(s => s.day === key);
  }

  function handleDragOver(e: DragEvent, day: DayKey) {
    if (!app.drag) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    // offsetY relative to the day column
    const col = e.currentTarget as HTMLElement;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slot = clampSlot(y, app.drag.slots);
    hints[day] = { slot, n: app.drag.slots };
  }

  function handleDragLeave(day: DayKey) {
    hints[day] = null;
  }

  function handleDrop(e: DragEvent, day: DayKey) {
    e.preventDefault();
    hints[day] = null;
    if (!app.drag) return;
    const col = e.currentTarget as HTMLElement;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slot = clampSlot(y, app.drag.slots);
    if (app.drag.type === 'sess') {
      moveSession(app.drag.id, day, slot);
    } else {
      scheduleUnscheduled(app.drag.id, day, slot);
    }
    clearDrag();
  }

  function handleSessDragStart(e: DragEvent, sessId: string, slots: number) {
    setDrag({ type: 'sess', id: sessId, slots });
    confirmSess = null;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function handleSessDragEnd(e: DragEvent, sessId: string) {
    // If drag ended with no valid drop (dropEffect none), send to Overflow
    if (app.drag?.id === sessId && e.dataTransfer?.dropEffect === 'none') {
      unscheduleSession(sessId);
    }
    clearDrag();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') confirmSess = null; }} />

<div id="grid-container" class:active={activeOnMobile}>
  <div id="grid-scroll">

    <!-- Sticky header row -->
    <div id="grid-header">
      <div class="hcorner"></div>
      {#each DAYS as day (day.key)}
        <div
          class="day-head"
          class:wknd={day.weekend}
          class:today={day.today}
        >
          <div class="day-dn">{day.label}</div>
          <div class="day-num">{day.date}</div>
          {#if app.weather[day.iso]}
            {@const w = app.weather[day.iso]}
            <div class="day-weather" title="{w.desc} · {w.high}°/{w.low}°F">
              <span class="w-icon">{w.emoji}</span><span class="w-temp">{w.high}°</span>
            </div>
          {:else if Object.keys(app.weather).length === 0}
            <div class="day-weather loading">···</div>
          {/if}
          <div class="day-cap">{app.config.hoursPerDay[day.key]}h</div>
        </div>
      {/each}
    </div>

    <!-- Scrollable body -->
    <div id="grid-body">

      <!-- Time labels column -->
      <div id="time-col">
        {#each { length: NSLOTS } as _, i}
          <div class="time-tick" class:half={i % 2 !== 0}>
            {slotTime(i)}
          </div>
        {/each}
      </div>

      <!-- Day columns -->
      <div id="days-row">
        {#each DAYS as day (day.key)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="day-col"
            class:wknd={day.weekend}
            style="height:{NSLOTS * SLOT_H}px"
            ondragover={(e) => handleDragOver(e, day.key)}
            ondragleave={() => handleDragLeave(day.key)}
            ondrop={(e) => handleDrop(e, day.key)}
          >
            <!-- Slot grid lines -->
            {#each { length: NSLOTS } as _, i}
              <div
                class="slot-line"
                class:hour={i % 2 === 0}
                style="top:{i * SLOT_H}px"
              ></div>
            {/each}

            <!-- Block-offs -->
            {#each dayBlockoffs(day.key) as bo (bo.id)}
              <div
                class="blockoff"
                style="top:{bo.startSlot * SLOT_H}px;height:{bo.slots * SLOT_H}px"
              >
                {bo.label}
              </div>
            {/each}

            <!-- Sessions -->
            {#each daySessions(day.key) as sess (sess.id)}
              {@const task = app.tasks.find(t => t.id === sess.taskId)}
              {#if task}
                {@const n = slotsFor(task.sessionMin)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="sess p{task.priority}"
                  class:dragging={app.drag?.id === sess.id}
                  style="top:{sess.slot * SLOT_H + 2}px;height:{n * SLOT_H - 4}px"
                  draggable="true"
                  ondragstart={(e) => handleSessDragStart(e, sess.id, n)}
                  ondragend={(e) => handleSessDragEnd(e, sess.id)}
                >
                  <div class="s-title">{task.title}</div>
                  {#if n >= 2}
                    <div class="s-time">{slotTime(sess.slot)} – {slotTime(sess.slot + n)}</div>
                  {/if}

                  {#if confirmSess === sess.id}
                    <!-- Inline done/remove choice -->
                    <div class="sess-confirm">
                      <button class="sc-done" onclick={(e) => { e.stopPropagation(); markDone(sess.id); confirmSess = null; }}>✓ Done</button>
                      <button class="sc-del"  onclick={(e) => { e.stopPropagation(); deleteSess(sess.id); confirmSess = null; }}>✗ Remove</button>
                    </div>
                  {:else}
                    <span
                      class="s-check"
                      title="Mark done / remove"
                      role="button"
                      tabindex="0"
                      onclick={(e) => { e.stopPropagation(); confirmSess = sess.id; }}
                      onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); confirmSess = sess.id; } }}
                    >&#10003;</span>
                  {/if}
                </div>
              {/if}
            {/each}

            <!-- Drop hint overlay (shown during drag) -->
            {#if hints[day.key]}
              <div
                class="drop-hint"
                style="top:{hints[day.key]!.slot * SLOT_H + 2}px;height:{hints[day.key]!.n * SLOT_H - 4}px"
              ></div>
            {/if}

          </div>
        {/each}
      </div>

    </div>
  </div>
</div>
