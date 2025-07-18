<script lang="ts">
  import Button from "$lib/components/ui/Button.svelte";
  import { chatActions } from "$lib/stores/chatStore";
  import { notifications } from "$lib/stores/notification";
  import { Bot, Clock, Copy, Heart, MoreVertical, Star, StarOff, ThumbsUp, User as UserIcon } from "lucide-svelte";
  import "../chat/chat-message.css";

  export let message: any;

  // Type-safe fallback for message.role
  $: isUser = message.role === "user" || message.type === "user";
  $: isAssistant = message.role === "assistant" || message.type === "assistant";
  $: emotionalTone = message.metadata?.emotionalTone;
  $: isProactive = message.metadata?.proactive;

  function copyToClipboard() {
    navigator.clipboard.writeText(message.content);
    notifications.add({
      type: "success",
      title: "Copied",
      message: "Message copied to clipboard",
    });}
  function toggleSaved() {
    chatActions.toggleMessageSaved(message.id);}
  function formatTime(timestamp: Date | string | number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });}
  function getEmotionalToneColor(tone: string): string {
    switch (tone) {
      case "encouraging":
        return "text-green-600";
      case "supportive":
        return "text-blue-600";
      case "enthusiastic":
        return "text-purple-600";
      case "thoughtful":
        return "text-indigo-600";
      case "professional":
        return "text-gray-600";
      default:
        return "text-gray-500";}}
  function getEmotionalToneIcon(tone: string) {
    switch (tone) {
      case "encouraging":
        return ThumbsUp;
      case "supportive":
        return Heart;
      case "enthusiastic":
        return Star;
      default:
        return null;}}
</script>

<div class="container mx-auto px-4">
  <!-- Avatar -->
  <div class="container mx-auto px-4">
    {#if isUser}
      <div
        class="container mx-auto px-4"
      >
        <UserIcon class="container mx-auto px-4" />
      </div>
    {:else}
      <div
        class="container mx-auto px-4"
      >
        <Bot class="container mx-auto px-4" />
      </div>
    {/if}
  </div>

  <!-- Message Content -->
  <div class="container mx-auto px-4">
    <!-- Message Bubble -->
    <div class="container mx-auto px-4">
      <div
        class="container mx-auto px-4"
      >
        <!-- Proactive Indicator -->
        {#if isProactive}
          <div class="container mx-auto px-4">
            <Clock class="container mx-auto px-4" />
            <span>Proactive suggestion</span>
          </div>
        {/if}

        <!-- Message Text -->
        <div
          class="container mx-auto px-4"
        >
          {@html message.content}
        </div>

        <!-- Emotional Tone Indicator for AI Messages -->
        {#if isAssistant && emotionalTone && emotionalTone !== "neutral"}
          {@const ToneIcon = getEmotionalToneIcon(emotionalTone)}
          <div class="container mx-auto px-4">
            {#if ToneIcon}
              <svelte:component this={ToneIcon} class="container mx-auto px-4" />
            {/if}
            <span class="container mx-auto px-4">{emotionalTone}</span>
          </div>
        {/if}
      </div>

      <!-- Message Actions -->
      <div
        class="container mx-auto px-4"
      >
        <!-- Timestamp -->
        <span class="container mx-auto px-4">
          {formatTime(message.timestamp)}
        </span>

        <!-- Actions (visible on hover) -->
        <div
          class="container mx-auto px-4"
        >
          <!-- Copy -->
          <Button
            variant="ghost"
            size="sm"
            class="container mx-auto px-4"
            on:click={() => copyToClipboard()}
            title="Copy message"
          >
            <Copy class="container mx-auto px-4" />
          </Button>

          <!-- Save/Unsave -->
          <Button
            variant="ghost"
            size="sm"
            class="container mx-auto px-4"
            on:click={() => toggleSaved()}
            title={message.saved ? "Remove from saved" : "Save message"}
          >
            {#if message.saved}
              <Star class="container mx-auto px-4" />
            {:else}
              <StarOff class="container mx-auto px-4" />
            {/if}
          </Button>

          <!-- More Options -->
          <Button
            variant="ghost"
            size="sm"
            class="container mx-auto px-4"
            title="More options"
          >
            <MoreVertical class="container mx-auto px-4" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Metadata (for AI messages) -->
    {#if isAssistant && message.metadata}
      <div class="container mx-auto px-4">
        {#if message.metadata.model}
          <div class="container mx-auto px-4">
            <span>Model: {message.metadata.model}</span>
            {#if message.metadata.latency}
              <span>• {message.metadata.latency}ms</span>
            {/if}
          </div>
        {/if}

        {#if message.metadata.tokenCount}
          <div>Tokens: {message.metadata.tokenCount}</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* @unocss-include */
  :global(.message-content) {
    word-wrap: break-word;
    overflow-wrap: break-word;}
  :global(.message-content p) {
    margin-bottom: 0.5rem;}
  :global(.message-content p:last-child) {
    margin-bottom: 0;}
  :global(.message-content ul, .message-content ol) {
    margin: 0.5rem 0;
    padding-left: 1.25rem;}
  :global(.message-content li) {
    margin-bottom: 0.25rem;}
  :global(.message-content code) {
    background: rgba(0, 0, 0, 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: "Courier New", monospace;
    font-size: 0.875em;}
  :global(.message-content blockquote) {
    border-left: 3px solid rgba(0, 0, 0, 0.2);
    padding-left: 1rem;
    margin: 0.5rem 0;
    font-style: italic;}
  :global(.message-content h1, .message-content h2, .message-content h3) {
    font-weight: 600;
    margin: 0.75rem 0 0.5rem 0;}
  :global(.message-content h1) {
    font-size: 1.25em;}
  :global(.message-content h2) {
    font-size: 1.125em;}
  :global(.message-content h3) {
    font-size: 1em;}
</style>
