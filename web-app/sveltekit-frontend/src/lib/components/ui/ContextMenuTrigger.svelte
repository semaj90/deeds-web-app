<script lang="ts">
  import { createContextMenu, melt } from "@melt-ui/svelte";
  import { setContext } from "svelte";

  // Create the context menu and set it in context for child components
  const contextMenu = createContextMenu();
  setContext("contextMenu", contextMenu);

  const { elements } = contextMenu;
  const { trigger } = elements;
</script>

<div use:melt={$trigger}>
  <slot />
</div>
