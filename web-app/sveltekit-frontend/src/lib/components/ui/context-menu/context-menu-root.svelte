<script lang="ts">
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  
  export let onOpenChange: ((open: boolean) => void) | undefined = undefined;
  
  const isOpen = writable(false);
  const position = writable({ x: 0, y: 0 });
  
  setContext('context-menu', {
    isOpen,
    position,
    close: () => {
      isOpen.set(false);
      onOpenChange?.(false);
    },
    open: (x: number, y: number) => {
      position.set({ x, y });
      isOpen.set(true);
      onOpenChange?.(true);
}
  });
</script>

<div class="container mx-auto px-4">
  <slot />
</div>

<style>
  /* @unocss-include */
  .context-menu-root {
    position: relative;
}
</style>
