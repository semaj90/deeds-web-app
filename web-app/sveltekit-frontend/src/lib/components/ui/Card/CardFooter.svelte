<script lang="ts">
  import { cn } from "$lib/utils";

  let className: string = "";
  export { className as class };
</script>

<div class={cn("flex items-center p-6 pt-0", className)} {...$$restProps}>
  <slot />
</div>
