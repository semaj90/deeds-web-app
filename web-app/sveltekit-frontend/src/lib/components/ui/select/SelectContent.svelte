<script lang="ts">
  import { getContext } from "svelte";
  import { writable } from "svelte/store";
  import type { SelectContext } from "./types";

  export let class_: string = "";

  const context =
    getContext<SelectContext>("select") ||
    ({
      open: writable(false),
      selected: writable(null),
      onSelect: () => {},
      onToggle: () => {}
    } satisfies SelectContext);
  const { open } = context;
</script>

{#if $open}
  <div class="container mx-auto px-4" role="listbox">
    <slot />
  </div>
{/if}

<style>
  /* @unocss-include */
  .select-content {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 50;
    max-height: 200px;
    overflow-y: auto;}
</style>
