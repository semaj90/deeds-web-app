<script lang="ts">
  import { page } from "$app/stores";
  import ChatInterface from "$lib/components/ai/ChatInterface.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    chatActions,
    chatStore,
    conversationsList,
  } from "$lib/stores/chatStore";
  import {
    Bot,
    Clock,
    MessageSquare,
    Plus,
    Save,
    Search,
    Sparkles,
  } from "lucide-svelte";
  import { onMount } from "svelte";

  let selectedConversationId: string | null = null;
  let searchQuery = "";
  let showHistory = true;

  onMount(() => {
    chatActions.loadFromStorage();
  });

  function startNewChat() {
    const caseId = $page.url.searchParams.get("caseId") || undefined;
    chatActions.newConversation(caseId);
    selectedConversationId = null;
    showHistory = false;
}
  async function loadConversation(conversationId: string) {
    chatActions.loadConversation(conversationId);
    selectedConversationId = conversationId;
    showHistory = false;
}
  function showHistoryPanel() {
    showHistory = true;
}
  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays} days ago`;

    return date.toLocaleDateString();
}
  $: filteredHistory = $conversationsList.filter(
    (conv) =>
      conv.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.messages?.some((msg) =>
        msg.content?.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );
</script>

<svelte:head>
  <title>AI Assistant - WardenNet Legal</title>
  <meta
    name="description"
    content="Intelligent AI assistant for legal case management and analysis"
  />
</svelte:head>

<div class="container mx-auto px-4">
  <div class="container mx-auto px-4">
    <!-- Header -->
    <div
      class="container mx-auto px-4"
    >
      <div class="container mx-auto px-4">
        <div class="container mx-auto px-4">
          <div class="container mx-auto px-4">
            <Bot class="container mx-auto px-4" />
          </div>
          <div>
            <h1 class="container mx-auto px-4">AI Legal Assistant</h1>
            <p class="container mx-auto px-4">
              Your intelligent partner for legal research and case analysis
            </p>
          </div>
        </div>

        <div class="container mx-auto px-4">
          <div
            class="container mx-auto px-4"
          >
            <Sparkles class="container mx-auto px-4" />
            <span class="container mx-auto px-4">Legal AI Assistant</span>
          </div>
        </div>
      </div>
    </div>

    <div class="container mx-auto px-4">
      <!-- Chat History Sidebar -->
      {#if showHistory}
        <div class="container mx-auto px-4">
          <div
            class="container mx-auto px-4"
          >
            <div class="container mx-auto px-4">
              <h2 class="container mx-auto px-4">
                <Clock class="container mx-auto px-4" />
                Chat History
              </h2>
              <Button
                variant="outline"
                size="sm"
                on:click={() => startNewChat()}
              >
                <Plus class="container mx-auto px-4" />
                New
              </Button>
            </div>

            <!-- Search -->
            <div class="container mx-auto px-4">
              <Search
                class="container mx-auto px-4"
              />
              <input
                type="text"
                placeholder="Search conversations..."
                bind:value={searchQuery}
                class="container mx-auto px-4"
              />
            </div>

            <!-- Conversation List -->
            <div class="container mx-auto px-4">
              {#each filteredHistory as conversation (conversation.id)}
                <button
                  class="container mx-auto px-4"
                  on:click={() => loadConversation(conversation.id)}
                >
                  <h3 class="container mx-auto px-4">
                    {conversation.title}
                  </h3>
                  <p class="container mx-auto px-4">
                    {formatDate(conversation.updated.toString())} • {conversation
                      .messages.length} messages
                  </p>
                  {#if $page.url.searchParams.get("caseId")}
                    <span
                      class="container mx-auto px-4"
                    >
                      Case: {$page.url.searchParams.get("caseId")}
                    </span>
                  {/if}
                </button>
              {/each}

              {#if filteredHistory.length === 0}
                <div class="container mx-auto px-4">
                  <MessageSquare class="container mx-auto px-4" />
                  <p class="container mx-auto px-4">No conversations found</p>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Main Chat Interface -->
      <div class={showHistory ? "lg:col-span-3" : "lg:col-span-4"}>
        <div class="container mx-auto px-4">
          <!-- Chat Header -->
          <div
            class="container mx-auto px-4"
          >
            <div class="container mx-auto px-4">
              {#if !showHistory}
                <Button
                  variant="outline"
                  size="sm"
                  on:click={() => showHistoryPanel()}
                >
                  <Clock class="container mx-auto px-4" />
                  History
                </Button>
              {/if}

              <div>
                <h2 class="container mx-auto px-4">
                  {$chatStore.currentConversation?.title || "New Conversation"}
                </h2>
                {#if $chatStore.currentConversation?.id && $page.url.searchParams.get("caseId")}
                  <p class="container mx-auto px-4">
                    Case: {$page.url.searchParams.get("caseId")}
                  </p>
                {/if}
              </div>
            </div>

            <div class="container mx-auto px-4">
              {#if $chatStore.currentConversation}
                <Button
                  variant="outline"
                  size="sm"
                  on:click={() => chatActions.saveToStorage()}
                >
                  <Save class="container mx-auto px-4" />
                  Save
                </Button>
              {/if}

              <Button
                variant="outline"
                size="sm"
                on:click={() => startNewChat()}
              >
                <Plus class="container mx-auto px-4" />
                New Chat
              </Button>
            </div>
          </div>

          <!-- Chat Interface -->
          <div class="container mx-auto px-4">
            <ChatInterface
              height="500px"
              caseId={$page.url.searchParams.get("caseId")}
            />
          </div>
        </div>

        <!-- Quick Actions -->
        {#if !$chatStore.currentConversation || $chatStore.currentConversation.messages.length === 0}
          <div class="container mx-auto px-4">
            <h3 class="container mx-auto px-4">
              <Sparkles class="container mx-auto px-4" />
              Quick Start
            </h3>

            <div class="container mx-auto px-4">
              {#each ["Analyze this case for legal precedents", "Generate a prosecution strategy", "Summarize evidence findings", "Draft a legal brief outline", "Research similar cases", "Identify key witnesses to interview"] as prompt}
                <Button
                  variant="outline"
                  class="container mx-auto px-4"
                  on:click={() => {
                    if (!$chatStore.currentConversation)
                      chatActions.newConversation();
                    // Add the prompt to the conversation
                    chatActions.addMessage(prompt, "user");
                  }}
                >
                  <span class="container mx-auto px-4">{prompt}</span>
                </Button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
