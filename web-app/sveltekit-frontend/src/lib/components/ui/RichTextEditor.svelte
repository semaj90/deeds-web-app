<script lang="ts">
  import { Editor } from "@tiptap/core";
  import Image from "@tiptap/extension-image";
  import Placeholder from "@tiptap/extension-placeholder";
  import StarterKit from "@tiptap/starter-kit";
  import {
    Bold,
    Image as ImageIcon,
    Italic,
    List,
    ListOrdered,
    Save,
  } from "lucide-svelte";
  import { createEventDispatcher, onDestroy, onMount } from "svelte";

  const dispatch = createEventDispatcher<{
    save: { html: string; markdown: string; json: any };
    change: { html: string; markdown: string; json: any };
  }>();

  export let content = "";
  export let placeholder = "Start writing your note...";
  export let editable = true;
  export let showToolbar = true;
  export let autoSave = false;
  export let autoSaveDelay = 2000;

  let element: HTMLElement;
  let editor: Editor;
  let isReady = false;
  let autoSaveTimer: NodeJS.Timeout;

  // Toolbar state
  let isBold = false;
  let isItalic = false;
  let isBulletList = false;
  let isOrderedList = false;

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
        }),
        Image.configure({
          inline: true,
          allowBase64: true,
          HTMLAttributes: {
            class: "max-w-full h-auto rounded-lg",
          },
        }),
        Placeholder.configure({
          placeholder,
        }),
      ],
      content,
      editable,
      onUpdate: ({ editor }) => {
        updateToolbarState();
        handleContentChange();
      },
      onSelectionUpdate: ({ editor }) => {
        updateToolbarState();
      },
      onCreate: ({ editor }) => {
        isReady = true;
        updateToolbarState();
      },
    });
  });

  onDestroy(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);}
    editor?.destroy();
  });

  function updateToolbarState() {
    if (!editor || !isReady) return;

    isBold = editor.isActive("bold");
    isItalic = editor.isActive("italic");
    isBulletList = editor.isActive("bulletList");
    isOrderedList = editor.isActive("orderedList");}
  function handleContentChange() {
    if (!editor || !isReady) return;

    const html = editor.getHTML();
    const json = editor.getJSON();

    // Convert to markdown (simple conversion)
    const markdown = htmlToMarkdown(html);

    dispatch("change", { html, markdown, json });

    if (autoSave) {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);}
      autoSaveTimer = setTimeout(() => {
        dispatch("save", { html, markdown, json });
      }, autoSaveDelay);}}
  function htmlToMarkdown(html: string): string {
    // Simple HTML to Markdown conversion
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/g, "# $1\n\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/g, "## $1\n\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/g, "### $1\n\n")
      .replace(/<strong[^>]*>(.*?)<\/strong>/g, "**$1**")
      .replace(/<b[^>]*>(.*?)<\/b>/g, "**$1**")
      .replace(/<em[^>]*>(.*?)<\/em>/g, "*$1*")
      .replace(/<i[^>]*>(.*?)<\/i>/g, "*$1*")
      .replace(/<ul[^>]*>(.*?)<\/ul>/gs, (match, content) => {
        return content.replace(/<li[^>]*>(.*?)<\/li>/g, "- $1\n") + "\n";
      })
      .replace(/<ol[^>]*>(.*?)<\/ol>/gs, (match, content) => {
        let counter = 1;
        return (
          content.replace(/<li[^>]*>(.*?)<\/li>/g, () => `${counter++}. $1\n`) +
          "\n"
        );
      })
      .replace(/<p[^>]*>(.*?)<\/p>/g, "$1\n\n")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "") // Remove remaining HTML tags
      .replace(/\n{3,}/g, "\n\n") // Clean up excessive newlines
      .trim();}
  // Toolbar actions
  function toggleBold() {
    editor?.chain().focus().toggleBold().run();}
  function toggleItalic() {
    editor?.chain().focus().toggleItalic().run();}
  function toggleBulletList() {
    editor?.chain().focus().toggleBulletList().run();}
  function toggleOrderedList() {
    editor?.chain().focus().toggleOrderedList().run();}
  function addImage() {
    const url = prompt("Enter image URL:");
    if (url) {
      editor?.chain().focus().setImage({ src: url }).run();}}
  function setHeading(level: number) {
    if (level === 0) {
      editor?.chain().focus().setParagraph().run();
    } else {
      editor
        ?.chain()
        .focus()
        .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
        .run();}}
  function saveContent() {
    if (!editor || !isReady) return;

    const html = editor.getHTML();
    const json = editor.getJSON();
    const markdown = htmlToMarkdown(html);

    dispatch("save", { html, markdown, json });}
  // Public methods
  export function getContent() {
    if (!editor || !isReady) return { html: "", markdown: "", json: null };

    const html = editor.getHTML();
    const json = editor.getJSON();
    const markdown = htmlToMarkdown(html);

    return { html, markdown, json };}
  export function setContent(
    newContent: string,
    format: "html" | "json" = "html"
  ) {
    if (!editor || !isReady) return;

    if (format === "json") {
      editor.commands.setContent(JSON.parse(newContent));
    } else {
      editor.commands.setContent(newContent);}}
  export function focus() {
    editor?.commands.focus();}
  export function clear() {
    editor?.commands.clearContent();}
</script>

{#if showToolbar && editable}
  <div
    class="container mx-auto px-4"
  >
    <!-- Heading Dropdown -->
    <select
      class="container mx-auto px-4"
      on:change={(e) =>
        setHeading(parseInt((e.target as HTMLInputElement).value))}
    >
      <option value="0">Normal</option>
      <option value="1">Heading 1</option>
      <option value="2">Heading 2</option>
      <option value="3">Heading 3</option>
    </select>

    <div class="container mx-auto px-4"></div>

    <!-- Text Formatting -->
    <button
      type="button"
      class="container mx-auto px-4"
      on:click={() => toggleBold()}
      title="Bold"
    >
      <Bold class="container mx-auto px-4" />
    </button>

    <button
      type="button"
      class="container mx-auto px-4"
      on:click={() => toggleItalic()}
      title="Italic"
    >
      <Italic class="container mx-auto px-4" />
    </button>

    <div class="container mx-auto px-4"></div>

    <!-- Lists -->
    <button
      type="button"
      class="container mx-auto px-4"
      on:click={() => toggleBulletList()}
      title="Bullet List"
    >
      <List class="container mx-auto px-4" />
    </button>

    <button
      type="button"
      class="container mx-auto px-4"
      on:click={() => toggleOrderedList()}
      title="Numbered List"
    >
      <ListOrdered class="container mx-auto px-4" />
    </button>

    <div class="container mx-auto px-4"></div>

    <!-- Image -->
    <button
      type="button"
      class="container mx-auto px-4"
      on:click={() => addImage()}
      title="Add Image"
    >
      <ImageIcon class="container mx-auto px-4" />
    </button>

    <div class="container mx-auto px-4"></div>

    <!-- Save Button -->
    <button
      type="button"
      class="container mx-auto px-4"
      on:click={() => saveContent()}
      title="Save Content"
    >
      <Save class="container mx-auto px-4" />
      Save
    </button>
  </div>
{/if}

<div
  bind:this={element}
  class="container mx-auto px-4"
></div>

<style>
  /* @unocss-include */
  :global(.ProseMirror) {
    outline: none;
    min-height: 200px;}
  :global(.ProseMirror p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    color: #9ca3af;
    pointer-events: none;
    height: 0;}
  :global(.ProseMirror img) {
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 0.5rem 0;}
  :global(.ProseMirror h1) {
    font-size: 1.875rem;
    font-weight: 700;
    margin: 1rem 0 0.5rem 0;
    line-height: 1.2;}
  :global(.ProseMirror h2) {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 1rem 0 0.5rem 0;
    line-height: 1.3;}
  :global(.ProseMirror h3) {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0.75rem 0 0.5rem 0;
    line-height: 1.4;}
  :global(.ProseMirror ul, .ProseMirror ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;}
  :global(.ProseMirror li) {
    margin: 0.25rem 0;}
  :global(.ProseMirror strong) {
    font-weight: 600;}
  :global(.ProseMirror em) {
    font-style: italic;}
</style>
