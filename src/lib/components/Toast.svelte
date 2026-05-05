<script lang="ts">
  import { app } from '$lib/store.svelte.js';
</script>

{#if app.toast}
  <div class="toast show" class:err={app.toast.error}>
    {app.toast.msg}
  </div>
{/if}
