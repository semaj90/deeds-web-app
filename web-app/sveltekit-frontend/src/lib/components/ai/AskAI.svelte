<!-- Ask AI Component with Vector Search Integration -->
<script lang="ts">
  import { browser } from "$app/environment";
  import {
    AlertCircle,
    Brain,
    CheckCircle,
    Loader2,
    MessageCircle,
    Search,
  } from "lucide-svelte/icons";
  import { createEventDispatcher, onMount } from "svelte";
  import { speakWithCoqui, loadCoquiTTS } from '$lib/services/coquiTTS';

  export let caseId: string | undefined = undefined;
  export let evidenceIds: string[] = [];
  export let placeholder = "Ask AI about this case...";
  export let maxHeight = "400px";
  export let showReferences = true;
  export let enableVoiceInput = false;
  // Add this prop for voice output
  export let enableVoiceOutput = false;

  interface AIResponse {
    answer: string;
    references: Array<{
      id: string;
      type: string;
      title: string;
      relevanceScore: number;
      citation: string;
    }>;
    confidence: number;
    searchResults: number;
    model: string;
    processingTime: number;
}
  interface ConversationMessage {
    id: string;
    type: "user" | "ai";
    content: string;
    timestamp: number;
    references?: AIResponse["references"];
    confidence?: number;
    metadata?: Record<string, any>;
}
  // Component state
  let query = "";
  let isLoading = false;
  let error = "";
  let conversation: ConversationMessage[] = [];
  let textareaRef: HTMLTextAreaElement;
  let messagesContainer: HTMLDivElement;

  // Advanced options
  let showAdvancedOptions = false;
  let selectedModel: "openai" | "ollama" = "openai";
  let searchThreshold = 0.7;
  let maxResults = 10;
  let temperature = 0.7;

  // Voice input state
  let isListening = false;
  // Fix SpeechRecognition type for browser
  let recognition: any = null;
  let ttsLoading = false;

  const dispatch = createEventDispatcher<{
    response: AIResponse;
    error: string;
    referenceClicked: { id: string; type: string };
  }>();

  // Simple IndexedDB wrapper for conversation storage
  const getIndexedDBService = () => ({
    async getSetting(key: string): Promise<any> {
      if (!browser) return null;
      try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
}
    },
    async setSetting(key: string, value: any): Promise<void> {
      if (!browser) return;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn("Storage failed:", error);
}
    },
  });

  // Simple user activity tracking
  async function trackUserActivity(activity: any): Promise<void> {
    if (!browser) return;
    try {
      console.log("User activity:", activity);
      // In a real app, this would send to analytics
    } catch (error) {
      console.warn("Activity tracking failed:", error);
}}
  onMount(() => {
    // Initialize speech recognition if supported and enabled
    if (enableVoiceInput && "webkitSpeechRecognition" in window) {
      recognition = new (window as any).webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        query = transcript;
        textareaRef?.focus();
      };

      recognition.onerror = () => {
        isListening = false;
      };

      recognition.onend = () => {
        isListening = false;
      };
}
    // Load conversation history from IndexedDB
    loadConversationHistory();
  });

  async function loadConversationHistory() {
    try {
      const contextKey = caseId ? `case_${caseId}` : "general";
      const indexedDBService = getIndexedDBService();
      const history = await indexedDBService.getSetting(
        `ai_conversation_${contextKey}`
      );

      if (history && Array.isArray(history)) {
        conversation = history.slice(-10); // Load last 10 messages
}
    } catch (error) {
      console.warn("Failed to load conversation history:", error);
}}
  async function saveConversationHistory() {
    try {
      const contextKey = caseId ? `case_${caseId}` : "general";
      const indexedDBService = getIndexedDBService();
      await indexedDBService.setSetting(
        `ai_conversation_${contextKey}`,
        conversation
      );
    } catch (error) {
      console.warn("Failed to save conversation history:", error);
}}
  async function askAI() {
    if (!query.trim() || isLoading) return;

    const userMessage: ConversationMessage = {
      id: generateId(),
      type: "user",
      content: query.trim(),
      timestamp: Date.now(),
    };
    conversation = [...conversation, userMessage];
    const currentQuery = query;
    query = "";
    isLoading = true;
    error = "";
    let aiMessageId = generateId();
    let aiMessage: ConversationMessage = {
      id: aiMessageId,
      type: "ai",
      content: "",
      timestamp: Date.now(),
      references: [],
      confidence: undefined,
      metadata: {},
    };
    conversation = [...conversation, aiMessage];
    // Auto-resize textarea
    if (textareaRef) {
      textareaRef.style.height = "auto";
}
    let controller = null;
    try {
      // Simple activity tracking (could be enhanced with analytics)
      console.log("User activity:", {
        type: "search",
        target: caseId ? "case" : "evidence",
        targetId: caseId || "general",
        query: currentQuery,
        timestamp: new Date().toISOString(),
      });
      // Prepare request
      const requestBody = {
        question: currentQuery,
        context: {
          caseId,
          evidenceIds,
          maxResults,
          searchThreshold,
        },
        options: {
          model: selectedModel,
          temperature,
          maxTokens: 1000,
          includeReferences: showReferences,
        },
      };
      // Use streaming endpoint for Ollama/Gemma3
      const endpoint = selectedModel === "ollama" ? "/api/ai/chat" : "/api/ai/ask";
      controller = new AbortController();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get AI response");
}
      if (selectedModel === "ollama" && response.body) {
        // Streaming response (Ollama/Gemma3)
        const reader = response.body.getReader();
        let decoder = new TextDecoder();
        let done = false;
        let buffer = "";
        // In the streaming loop:
        let meta: Record<string, any> = {};
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            // Try to parse JSON lines (newline-delimited)
            let lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const chunk = JSON.parse(line);
                if (chunk.answer !== undefined) {
                  aiMessage.content += chunk.answer;
                }
                if (chunk.confidence !== undefined) aiMessage.confidence = chunk.confidence;
                if (chunk.references !== undefined) aiMessage.references = chunk.references;
                if (chunk.model !== undefined) meta.model = chunk.model;
                if (chunk.processingTime !== undefined) meta.processingTime = chunk.processingTime;
                if (chunk.searchResults !== undefined) meta.searchResults = chunk.searchResults;
                aiMessage.metadata = meta;
                // Update conversation in-place
                conversation = conversation.map((m) => m.id === aiMessageId ? { ...aiMessage } : m);
                setTimeout(() => scrollToBottom(), 50);
              } catch (e) {
                // Ignore parse errors for incomplete lines
              }
            }
          }
        }
        // Save conversation and dispatch event after stream ends
        await saveConversationHistory();
        dispatch("response", {
          answer: aiMessage.content,
          references: aiMessage.references || [],
          confidence: aiMessage.confidence ?? 0,
          searchResults: meta.searchResults ?? 0,
          model: meta.model ?? "ollama",
          processingTime: meta.processingTime ?? 0,
        });
      } else {
        // Non-streaming (OpenAI or fallback)
        const aiResponse = await response.json();
        aiMessage = {
          id: aiMessageId,
          type: "ai",
          content: aiResponse.answer,
          timestamp: Date.now(),
          references: aiResponse.references,
          confidence: aiResponse.confidence,
          metadata: {
            model: aiResponse.model,
            processingTime: aiResponse.processingTime,
            searchResults: aiResponse.searchResults,
          },
        };
        conversation = conversation.map((m) => m.id === aiMessageId ? aiMessage : m);
        setTimeout(() => scrollToBottom(), 100);
        await saveConversationHistory();
        dispatch("response", aiResponse);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "An error occurred";
      console.error("AI request failed:", err);
      dispatch("error", error);
    } finally {
      isLoading = false;
}}
  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      askAI();
}}
  // Voice input (speech-to-text) with improved UX and browser compatibility
  function startVoiceInput() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      error = "Speech recognition not supported in this browser.";
      return;
    }
    if (!recognition) {
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        query = transcript;
        textareaRef?.focus();
        isListening = false;
      };
      recognition.onerror = () => {
        isListening = false;
      };
      recognition.onend = () => {
        isListening = false;
      };
    }
    if (!isListening) {
      isListening = true;
      recognition.start();
    }
  }
  function stopVoiceInput() {
    if (recognition && isListening) {
      recognition.stop();
      isListening = false;
    }
  }
  // Voice output (text-to-speech)
  async function speak(text: string) {
    ttsLoading = true;
    try {
      // Try Coqui TTS HTTP API via SvelteKit endpoint
      const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
      if (res.ok) {
        const audioData = await res.arrayBuffer();
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await context.decodeAudioData(audioData);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(0);
      } else {
        throw new Error('TTS server error');
      }
    } catch (e) {
      // fallback to browser TTS
      if ('speechSynthesis' in window) {
        const utter = new window.SpeechSynthesisUtterance(text);
        utter.lang = "en-US";
        window.speechSynthesis.speak(utter);
      }
    } finally {
      ttsLoading = false;
    }
}
  function handleReferenceClick(
    reference: NonNullable<ConversationMessage["references"]>[0]
  ) {
    dispatch("referenceClicked", {
      id: reference.id,
      type: reference.type,
    });
}
  function clearConversation() {
    conversation = [];
    saveConversationHistory();
}
  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
}}
  function generateId(): string {
    return Math.random().toString(36).substr(2, 9);
}
  function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
}
  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return "text-green-600";
    if (confidence >= 0.6) return "text-yellow-600";
    return "text-red-600";
}
  function getConfidenceIcon(confidence: number) {
    if (confidence >= 0.8) return CheckCircle;
    if (confidence >= 0.6) return AlertCircle;
    return AlertCircle;
}
  // Auto-resize textarea
  function autoResize(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    target.style.height = "auto";
    target.style.height = target.scrollHeight + "px";
}
</script>

<div class="container mx-auto px-4">
  <!-- Header -->
  <div class="container mx-auto px-4">
    <div class="container mx-auto px-4">
      <div class="container mx-auto px-4">
        <Brain class="container mx-auto px-4" />
        <h3 class="container mx-auto px-4">Ask AI Assistant</h3>
        {#if caseId}
          <span class="container mx-auto px-4">• Case Context</span>
        {/if}
      </div>

      <div class="container mx-auto px-4">
        <button
          type="button"
          class="container mx-auto px-4"
          on:click={() => (showAdvancedOptions = !showAdvancedOptions)}
        >
          Advanced
        </button>

        {#if conversation.length > 0}
          <button
            type="button"
            class="container mx-auto px-4"
            on:click={() => clearConversation()}
          >
            Clear
          </button>
        {/if}
      </div>
    </div>

    <!-- Advanced Options -->
    {#if showAdvancedOptions}
      <div class="container mx-auto px-4">
        <div class="container mx-auto px-4">
          <div>
            <label
              class="container mx-auto px-4"
              for="field-1"
            >
              Model
            </label>
            <select
              bind:value={selectedModel}
              class="container mx-auto px-4"
              id="field-1"
            >
              <option value="openai">OpenAI GPT-3.5</option>
              <option value="ollama">Local LLM (Gemma)</option>
            </select>
          </div>

          <div>
            <label
              class="container mx-auto px-4"
              for="field-2"
            >
              Search Threshold
            </label>
            <input
              type="range"
              min="0.5"
              max="0.9"
              step="0.1"
              bind:value={searchThreshold}
              class="container mx-auto px-4"
              id="field-2"
            />
            <span class="container mx-auto px-4">{searchThreshold}</span>
          </div>
        </div>

        <div class="container mx-auto px-4">
          <div>
            <label
              class="container mx-auto px-4"
              for="field-3"
            >
              Max Results
            </label>
            <input
              type="number"
              min="5"
              max="50"
              bind:value={maxResults}
              class="container mx-auto px-4"
              id="field-3"
            />
          </div>

          <div>
            <label
              class="container mx-auto px-4"
              for="field-4"
            >
              Temperature
            </label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              bind:value={temperature}
              class="container mx-auto px-4"
              id="field-4"
            />
            <span class="container mx-auto px-4">{temperature}</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Conversation -->
  <div
    bind:this={messagesContainer}
    class="container mx-auto px-4"
    style="max-height: {maxHeight};"
    aria-live="polite"
  >
    {#if conversation.length === 0}
      <div class="container mx-auto px-4">
        <MessageCircle class="container mx-auto px-4" />
        <p class="container mx-auto px-4">Start a conversation with the AI assistant</p>
        <p class="container mx-auto px-4">
          Ask questions about cases, evidence, or legal procedures
        </p>
      </div>
    {:else}
      {#each conversation as message (message.id)}
        <div class="container mx-auto px-4">
          <div class="container mx-auto px-4">
            <div class="container mx-auto px-4">
              {#if message.type === "user"}
                <div
                  class="container mx-auto px-4"
                >
                  <span class="container mx-auto px-4">U</span>
                </div>
              {:else}
                <div
                  class="container mx-auto px-4"
                >
                  <Brain class="container mx-auto px-4" />
                </div>
              {/if}
            </div>

            <div class="container mx-auto px-4">
              <div class="container mx-auto px-4">
                <span class="container mx-auto px-4">
                  {message.type === "user" ? "You" : "AI Assistant"}
                </span>
                <span class="container mx-auto px-4">
                  {formatTimestamp(message.timestamp)}
                </span>

                {#if message.type === "ai" && message.confidence !== undefined}
                  <div class="container mx-auto px-4">
                    <svelte:component
                      this={getConfidenceIcon(message.confidence)}
                      class="container mx-auto px-4"
                    />
                    <span
                      class="container mx-auto px-4"
                    >
                      {Math.round(message.confidence * 100)}%
                    </span>
                  </div>
                {/if}
              </div>

              <div class="container mx-auto px-4">
                <p class="container mx-auto px-4">{message.content}
                  {#if message.type === "ai" && isLoading && conversation[conversation.length-1]?.id === message.id}
                    <span class="blinking-cursor">|</span>
                  {/if}
                </p>
                {#if message.type === "ai" && message.content && enableVoiceOutput}
                  <button
                    type="button"
                    class="container mx-auto px-4"
                    aria-label="Listen to AI response"
                    on:click={() => speak(message.content)}
                    disabled={ttsLoading}
                  >
                    {#if ttsLoading}
                      <Loader2 class="mx-auto px-4 max-w-7xl animate-spin" />
                      <span>Loading voice...</span>
                    {:else}
                      🔊 Listen
                    {/if}
                  </button>
                {/if}
              </div>

              <!-- References -->
              {#if message.references && message.references.length > 0 && showReferences}
                <div class="container mx-auto px-4">
                  <h4 class="container mx-auto px-4">
                    References:
                  </h4>
                  <div class="container mx-auto px-4">
                    {#each message.references as reference}
                      <button
                        type="button"
                        class="container mx-auto px-4"
                        on:click={() => handleReferenceClick(reference)}
                      >
                        <span class="container mx-auto px-4"
                          >{reference.type.toUpperCase()}:</span
                        >
                        {reference.title}
                        <span class="container mx-auto px-4"
                          >({Math.round(reference.relevanceScore * 100)}%)</span
                        >
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Metadata -->
              {#if message.metadata}
                <div class="container mx-auto px-4">
                  {#if message.metadata.model}
                    Model: {message.metadata.model}
                  {/if}
                  {#if message.metadata.processingTime}
                    • {message.metadata.processingTime}ms
                  {/if}
                  {#if message.metadata.searchResults}
                    • {message.metadata.searchResults} results
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Input Area -->
  <div class="container mx-auto px-4">
    {#if error}
      <div class="container mx-auto px-4">
        <div class="container mx-auto px-4">
          <AlertCircle class="container mx-auto px-4" />
          <span class="container mx-auto px-4">{error}</span>
        </div>
      </div>
    {/if}

    <div class="container mx-auto px-4">
      <div class="container mx-auto px-4">
        <textarea
          bind:this={textareaRef}
          bind:value={query}
          on:keypress={handleKeyPress}
          on:input={autoResize}
          {placeholder}
          disabled={isLoading}
          rows={1}
          class="container mx-auto px-4"
          aria-label="Ask AI input"
        ></textarea>
        {#if enableVoiceInput}
          <button
            type="button"
            class="container mx-auto px-4"
            class:text-red-500={isListening}
            aria-label={isListening ? "Stop voice input" : "Start voice input"}
            on:click={() => (isListening ? stopVoiceInput() : startVoiceInput())}
            disabled={isLoading}
          >
            🎤
          </button>
        {/if}
      </div>

      <button
        type="button"
        on:click={() => askAI()
        disabled={!query.trim() || isLoading}
        class="container mx-auto px-4"
        aria-label="Send question to AI"
      >
        {#if isLoading}
          <Loader2 class="container mx-auto px-4" />
          <span>Thinking...</span>
        {:else}
          <Search class="container mx-auto px-4" />
          <span>Ask</span>
        {/if}
      </button>
    </div>

    <div class="container mx-auto px-4">
      Press Enter to send, Shift+Enter for new line
      {#if caseId}
import type { Case } from '$lib/types';

        • Context: Case{caseId.slice(0, 8)}
      {/if}
      {#if evidenceIds.length > 0}
        • {evidenceIds.length} evidence item(s)
      {/if}
      {#if selectedModel === "ollama"}
        • Using local LLM
      {/if}
    </div>
  </div>
</div>

<style>
  /* @unocss-include */
  .ai-chat-component {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
}
  .message {
    animation: slideInFromBottom 0.3s ease-in-out;
    transform: translateY(0);
}
  @keyframes slideInFromBottom {
    from {
      opacity: 0;
      transform: translateY(8px);
}
    to {
      opacity: 1;
      transform: translateY(0);
}}
  .user-message {
    opacity: 0.9;
}
  .ai-message {
    background-color: rgb(249 250 251);
    border-radius: 0.5rem;
    padding: 0.75rem;
    margin-left: -0.5rem;
    margin-right: -0.5rem;
}
  :global(.prose p) {
    margin-bottom: 0.5rem;
}
  :global(.prose p:last-child) {
    margin-bottom: 0;
}
  /* UnoCSS will handle the utility classes, this is for custom animations */
  .search-result:hover {
    background-color: rgb(239 246 255);
    border-color: rgb(147 197 253);
}
  .statute-reference {
    display: inline-block;
    font-weight: 500;
  }
  .blinking-cursor {
    display: inline-block;
    width: 1ch;
    animation: blink 1s steps(1) infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
</style>
