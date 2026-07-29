<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';

  let { children } = $props();

  /** True when a new version of the app is waiting to activate. */
  let updateReady = $state(false);

  onMount(async () => {
    if ('serviceWorker' in navigator) {
      const { registerSW } = await import('virtual:pwa-register');
      registerSW({
        immediate: true,
        onNeedRefresh() {
          updateReady = true;
        },
      });
    }
  });

  function applyUpdate() {
    // The new SW is already waiting (skipWaiting was called by immediate:true).
    // Reload to activate it and get fresh assets.
    window.location.reload();
  }
</script>

{#if updateReady}
  <div class="update-banner">
    <span>A new version is available.</span>
    <button class="update-btn" onclick={applyUpdate}>Refresh now</button>
  </div>
{/if}

{@render children()}

<style>
  .update-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--crimson);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
  }
  .update-btn {
    background: rgba(255,255,255,0.2);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 4px;
    padding: 3px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .update-btn:hover {
    background: rgba(255,255,255,0.35);
  }
</style>
