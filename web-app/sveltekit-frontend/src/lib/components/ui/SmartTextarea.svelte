<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import CommandMenu from "./CommandMenu.svelte";

  export let value = "";
  export let placeholder = "Type here... Use # for commands";
  export let rows = 4;
  export let disabled = false;
  export let readonly = false;
  export let className: string = "";
  export let triggerChar = "#";

  const dispatch = createEventDispatcher();

  let textarea: HTMLTextAreaElement;
  let commandMenu: CommandMenu;
  let showCommandMenu = false;
  let commandMenuPosition = { x: 0, y: 0 };
  let lastCursorPosition = 0;

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    value = target.value;

    // Check if user typed trigger character
    const cursorPosition = target.selectionStart;
    const textBeforeCursor = target.value.substring(0, cursorPosition);

    if (textBeforeCursor.endsWith(triggerChar)) {
      openCommandMenu();}
    dispatch("input", { value, target });}
  function handleKeydown(e: KeyboardEvent) {
    // Don't interfere with command menu navigation
    if (
      showCommandMenu &&
      ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)
    ) {
      return;}
    // Ctrl/Cmd + K to open command menu
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openCommandMenu();
      return;}
    dispatch("keydown", e);}
  function openCommandMenu() {
    if (!textarea) return;

    // Get cursor position
    const cursorPosition = textarea.selectionStart;
    lastCursorPosition = cursorPosition;

    // Calculate menu position relative to cursor
    const textBeforeCursor = textarea.value.substring(0, cursorPosition);
    const lines = textBeforeCursor.split("\n");
    const currentLine = lines.length - 1;
    const currentColumn = lines[lines.length - 1].length;

    // Simple approximation of cursor position
    const rect = textarea.getBoundingClientRect();
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;

    commandMenuPosition = {
      x: rect.left + currentColumn * 8, // Approximate character width
      y: rect.top + currentLine * lineHeight + lineHeight,
    };

    showCommandMenu = true;
    commandMenu?.openCommandMenu();}
  function handleCommandInsert(text: string) {
    // The CommandMenu component handles text insertion
    showCommandMenu = false;
    textarea.focus();
    dispatch("commandInsert", { text });}
  function handleBlur(e: FocusEvent) {
    // Don't close command menu immediately to allow clicking on it
    setTimeout(() => {
      if (!document.activeElement?.closest(".command-menu")) {
        showCommandMenu = false;}
    }, 150);

    dispatch("blur", e);}
  function handleFocus(e: FocusEvent) {
    dispatch("focus", e);}
  // Auto-resize textarea
  function autoResize() {
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";}}
  // Watch for value changes to auto-resize
  $: if (value !== undefined) {
    setTimeout(autoResize, 0);}
</script>

<div class="container mx-auto px-4">
  <textarea
    bind:this={textarea}
    bind:value
    {placeholder}
    {rows}
    {disabled}
    {readonly}
    class="container mx-auto px-4"
    on:input={handleInput}
    on:keydown={handleKeydown}
    on:blur={handleBlur}
    on:focus={handleFocus}
    on:change
    on:select
    on:paste
  ></textarea>

  {#if showCommandMenu}
    <div
      class="container mx-auto px-4"
      style="position: fixed; left: {commandMenuPosition.x}px; top: {commandMenuPosition.y}px; z-index: 1000;"
    >
      <CommandMenu
        bind:this={commandMenu}
        textareaElement={textarea}
        onInsert={handleCommandInsert}
        on:close={() => (showCommandMenu = false)}
      />
    </div>
  {/if}
</div>

<style>
  /* @unocss-include */
  .smart-textarea-container {
    position: relative;}
  .smart-textarea {
    width: 100%;
    min-height: 100px;
    resize: vertical;
    border: 1px solid var(--pico-border-color, #e2e8f0);
    border-radius: 0.5rem;
    padding: 0.75rem;
    font-family: inherit;
    font-size: 0.875rem;
    line-height: 1.5;
    background: var(--pico-card-background-color, #ffffff);
    color: var(--pico-color, #111827);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;}
  .smart-textarea:focus {
    outline: none;
    border-color: var(--pico-primary, #3b82f6);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);}
  .smart-textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--pico-card-sectioning-background-color, #f8fafc);}
  .smart-textarea:read-only {
    background: var(--pico-card-sectioning-background-color, #f8fafc);}
  .smart-textarea::placeholder {
    color: var(--pico-muted-color, #6b7280);}
  .command-menu-overlay {
    pointer-events: auto;}
  /* Help text styling */
  .smart-textarea-container::after {
    content: "Tip: Use # for commands or Ctrl/Cmd + K";
    position: absolute;
    bottom: -1.5rem;
    right: 0;
    font-size: 0.75rem;
    color: var(--pico-muted-color, #6b7280);
    opacity: 0;
    transition: opacity 0.15s ease;}
  .smart-textarea-container:hover::after {
    opacity: 1;}
</style>
