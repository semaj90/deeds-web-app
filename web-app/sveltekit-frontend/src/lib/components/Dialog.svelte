<script lang="ts">
	import { aiStore } from "$lib/stores/canvas";
	import { createEventDispatcher, onMount } from 'svelte';
	import { quintOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	
	import { Bot, Send, User as UserIcon, X } from "lucide-svelte";

	export let title = 'AI Assistant';
	export let open = false;

	const dispatch = createEventDispatcher();

	let dialogElement: HTMLElement;
	let promptInput: HTMLTextAreaElement;
	let messagesContainer: HTMLElement;

	// Vibe options
	const vibes = [
		{ id: 'professional', label: 'Professional', description: 'Formal and structured' },
		{ id: 'concise', label: 'Concise', description: 'Brief and to the point' },
		{ id: 'investigative', label: 'Investigative', description: 'Thorough and analytical' },
		{ id: 'dramatic', label: 'Dramatic', description: 'Engaging and vivid' },
		{ id: 'technical', label: 'Technical', description: 'Detailed and precise' }
	];

	// Reactive state
	$: selectedVibe = $aiStore.selectedVibe;
	$: prompt = $aiStore.prompt;
	$: response = $aiStore.response;
	$: isGenerating = $aiStore.isGenerating;
	$: history = $aiStore.history;

	let currentPrompt = '';

	onMount(() => {
		if (open) {
			focusInput();}
	});

	function focusInput() {
		setTimeout(() => {
			promptInput?.focus();
		}, 100);}
	function handleClose() {
		aiStore.update(state => ({ ...state, dialogOpen: false }));
		dispatch('close');}
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		} else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			handleSubmit();}}
	function handleVibeChange(vibeId: string) {
		aiStore.update(state => ({ ...state, selectedVibe: vibeId }));}
	async function handleSubmit() {
		if (!currentPrompt.trim() || isGenerating) return;

		const userMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content: currentPrompt.trim(),
			timestamp: new Date().toISOString()
		};

		// Add user message to history
		aiStore.update(state => ({
			...state,
			isGenerating: true,
			prompt: currentPrompt.trim(),
			history: [...state.history, userMessage]
		}));

		// Clear input
		currentPrompt = '';

		try {
			// Send request to AI API
			const response = await fetch('/api/ai/suggest', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					prompt: userMessage.content,
					vibe: selectedVibe,
					context: 'canvas'
				})
			});

			if (!response.ok) {
				throw new Error('Failed to get AI response');}
			const data = await response.json();

			const aiMessage = {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: data.response || 'Sorry, I could not generate a response.',
				timestamp: new Date().toISOString()
			};

			// Add AI response to history
			aiStore.update(state => ({
				...state,
				isGenerating: false,
				response: data.response,
				history: [...state.history, aiMessage]
			}));

			// Emit event for parent component
			dispatch('aiRequest', {
				prompt: userMessage.content,
				response: data.response,
				vibe: selectedVibe
			});

		} catch (error) {
			console.error('AI request failed:', error);
			
			const errorMessage = {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: 'Sorry, I encountered an error. Please try again.',
				timestamp: new Date().toISOString(),
				isError: true
			};

			aiStore.update(state => ({
				...state,
				isGenerating: false,
				history: [...state.history, errorMessage]
			}));}
		// Scroll to bottom of messages
		setTimeout(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;}
		}, 100);}
	function clearHistory() {
		aiStore.update(state => ({
			...state,
			history: [],
			prompt: '',
			response: ''
		}));}
	function formatTimestamp(timestamp: string) {
		return new Date(timestamp).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit'
		});}
	// Close on outside click
	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();}}
</script>

{#if open}
	<div 
		class="container mx-auto px-4"
		transition:fade={{ duration: 200  "
		on:click={() => handleBackdropClick()}
		on:keydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="dialog-title"
		tabindex={-1}
	>
		<div 
			class="container mx-auto px-4"
			bind:this={dialogElement}
			transition:fly={{ y: 50, duration: 300, easing: quintOut  "
		>
			<!-- Header -->
			<div class="container mx-auto px-4">
				<h2 id="dialog-title" class="container mx-auto px-4">{title}</h2>
				<button
					class="container mx-auto px-4"
					on:click={() => handleClose()}
					aria-label="Close dialog"
				>
					<X size={20} />
				</button>
			</div>

			<!-- Vibe Selection -->
			<div class="container mx-auto px-4">
				<h3 class="container mx-auto px-4">Select AI Vibe:</h3>
				<div class="container mx-auto px-4">
					{#each vibes as vibe}
						<button
							class="container mx-auto px-4"
							class:active={selectedVibe === vibe.id}
							on:click={() => handleVibeChange(vibe.id)}
							title={vibe.description}
						>
							{vibe.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Messages -->
			<div class="container mx-auto px-4" bind:this={messagesContainer}>
				{#if history.length === 0}
					<div class="container mx-auto px-4">
						<div class="container mx-auto px-4">
							<Bot size={48} />
						</div>
						<h3>AI Assistant Ready</h3>
						<p>Ask me anything about your case, evidence analysis, or report generation. I can help with:</p>
						<ul>
							<li>Evidence analysis and insights</li>
							<li>Report drafting and summarization</li>
							<li>Timeline creation suggestions</li>
							<li>Case connection identification</li>
						</ul>
					</div>
				{:else}
					{#each history as message}
						<div class="container mx-auto px-4" class:user={message.role === 'user'} class:error={message.isError}>
							<div class="container mx-auto px-4">
								{#if message.role === 'user'}
									<UserIcon size={20} />
								{:else}
									<Bot size={20} />
								{/if}
							</div>
							<div class="container mx-auto px-4">
								<div class="container mx-auto px-4">
									<span class="container mx-auto px-4">
										{message.role === 'user' ? 'You' : 'AI Assistant'}
									</span>
									<span class="container mx-auto px-4">
										{formatTimestamp(message.timestamp)}
									</span>
								</div>
								<div class="container mx-auto px-4">
									{message.content}
								</div>
							</div>
						</div>
					{/each}
				{/if}

				{#if isGenerating}
					<div class="container mx-auto px-4">
						<div class="container mx-auto px-4">
							<Bot size={20} />
						</div>
						<div class="container mx-auto px-4">
							<div class="container mx-auto px-4">
								<div class="container mx-auto px-4">
									<span></span>
									<span></span>
									<span></span>
								</div>
								<span class="container mx-auto px-4">AI is thinking...</span>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Input -->
			<div class="container mx-auto px-4">
				<div class="container mx-auto px-4">
					<textarea
						bind:this={promptInput}
						bind:value={currentPrompt}
						placeholder="Ask the AI assistant anything about your case..."
						rows="4"
						disabled={isGenerating}
						on:keydown={(e) => {
							if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
								e.preventDefault();
								handleSubmit();}
						"
					></textarea>
					<button
						class="container mx-auto px-4"
						on:click={() => handleSubmit()}
						disabled={!currentPrompt.trim() || isGenerating}
						aria-label="Send message"
					>
						<Send size={20} />
					</button>
				</div>
				<div class="container mx-auto px-4">
					<span>Press Ctrl+Enter to send</span>
					{#if history.length > 0}
						<button class="container mx-auto px-4" on:click={() => clearHistory()}>
							Clear History
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
  /* @unocss-include */
	.dialog-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		padding: 1rem;}
	.dialog-container {
		width: 100%;
		max-width: 600px;
		max-height: 80vh;
		background: var(--bg-secondary);
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		overflow: hidden;}
	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--border-light);
		background: var(--bg-primary);}
	.dialog-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);}
	.close-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: transparent;
		border: none;
		cursor: pointer;
		border-radius: 6px;
		transition: background 0.2s ease;
		color: var(--text-muted);}
	.close-button:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);}
	.vibe-section {
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--border-light);
		background: var(--bg-primary);}
	.vibe-title {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);}
	.vibe-options {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;}
	.vibe-button {
		padding: 0.5rem 1rem;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-light);
		color: var(--text-primary);
		border-radius: 20px;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 0.8rem;}
	.vibe-button:hover {
		background: var(--bg-secondary);
		border-color: var(--harvard-crimson);
		color: var(--harvard-crimson);}
	.vibe-button.active {
		background: var(--harvard-crimson);
		border-color: var(--harvard-crimson);
		color: var(--text-inverse);}
	.messages-container {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.5rem;
		max-height: 400px;}
	.welcome-message {
		text-align: center;
		padding: 2rem 1rem;
		color: var(--text-muted);}
	.welcome-icon {
		margin-bottom: 1rem;
		color: var(--harvard-crimson);}
	.welcome-message h3 {
		margin: 0 0 1rem;
		color: var(--text-primary);}
	.welcome-message ul {
		text-align: left;
		max-width: 300px;
		margin: 1rem auto 0;}
	.message {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;}
	.message.user {
		flex-direction: row-reverse;}
	.message.error .message-content {
		background: var(--del-background);
		border-color: var(--del-color);}
	.message-avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--bg-secondary);
		color: var(--harvard-crimson);
		flex-shrink: 0;}
	.message.user .message-avatar {
		background: var(--bg-tertiary);
		color: var(--text-primary);}
	.message-content {
		flex: 1;
		min-width: 0;}
	.message-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;}
	.message-role {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-primary);}
	.message-time {
		font-size: 0.75rem;
		color: var(--text-muted);}
	.message-text {
		background: var(--bg-primary);
		border: 1px solid var(--border-light);
		border-radius: 12px;
		padding: 0.75rem 1rem;
		line-height: 1.5;
		color: var(--text-primary);}
	.message.user .message-text {
		background: var(--harvard-crimson);
		color: var(--text-inverse);
		border-color: var(--harvard-crimson);}
	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--bg-primary);
		border: 1px solid var(--border-light);
		border-radius: 12px;}
	.typing-dots {
		display: flex;
		gap: 0.25rem;}
	.typing-dots span {
		width: 8px;
		height: 8px;
		background: var(--harvard-crimson);
		border-radius: 50%;
		animation: typing 1.4s infinite ease-in-out;}
	.typing-dots span:nth-child(1) { animation-delay: -0.32s; }
	.typing-dots span:nth-child(2) { animation-delay: -0.16s; }

	.typing-text {
		font-size: 0.875rem;
		color: var(--text-muted);}
	.input-section {
		padding: 1.5rem;
		border-top: 1px solid var(--border-light);
		background: var(--bg-primary);}
	.input-container {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;}
	.input-container textarea {
		flex: 1;
		resize: none;
		border: 1px solid var(--border-light);
		border-radius: 8px;
		padding: 0.75rem;
		background: var(--bg-secondary);
		color: var(--text-primary);
		line-height: 1.4;}
	.input-container textarea:focus {
		outline: none;
		border-color: var(--harvard-crimson);
		box-shadow: 0 0 0 2px var(--bg-secondary);}
	.send-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: var(--harvard-crimson);
		color: var(--text-inverse);
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;}
	.send-button:hover:not(:disabled) {
		background: var(--primary-hover);
		transform: translateY(-1px);}
	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;}
	.input-help {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.75rem;
		font-size: 0.75rem;
		color: var(--text-muted);}
	.clear-button {
		background: transparent;
		border: none;
		color: var(--harvard-crimson);
		cursor: pointer;
		font-size: 0.75rem;
		text-decoration: underline;}
	.clear-button:hover {
		color: var(--primary-hover);}
	@keyframes typing {
		0%, 60%, 100% {
			transform: scale(1);
			opacity: 0.5;}
		30% {
			transform: scale(1.4);
			opacity: 1;}}
	/* Custom scrollbar */
	.messages-container::-webkit-scrollbar {
		width: 6px;}
	.messages-container::-webkit-scrollbar-track {
		background: var(--bg-primary);}
	.messages-container::-webkit-scrollbar-thumb {
		background: var(--border-light);
		border-radius: 3px;}
	.messages-container::-webkit-scrollbar-thumb:hover {
		background: var(--harvard-crimson);}
	/* Responsive */
	@media (max-width: 768px) {
		.dialog-container {
			max-height: 90vh;
			margin: 0.5rem;}
		.dialog-header,
		.vibe-section,
		.input-section {
			padding: 1rem;}
		.messages-container {
			padding: 1rem;}
		.vibe-options {
			gap: 0.25rem;}
		.vibe-button {
			padding: 0.4rem 0.8rem;
			font-size: 0.75rem;}}
</style>
