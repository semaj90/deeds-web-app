export { default as Root } from "./context-menu-root.svelte";
export { default as Trigger } from "./context-menu-trigger.svelte";
export { default as Content } from "./context-menu-content.svelte";
export { default as Item } from "./context-menu-item.svelte";
export { default as Separator } from "./context-menu-separator.svelte";

// Re-export as namespace for convenience
export const ContextMenu = {
  Root: Root,
  Trigger: Trigger,
  Content: Content,
  Item: Item,
  Separator: Separator,
};
