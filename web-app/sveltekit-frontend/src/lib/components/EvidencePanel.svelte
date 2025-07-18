<script lang="ts">
  import type { Evidence } from "$lib/data/types";
  import { createEventDispatcher, onMount } from 'svelte';
  import { writable } from 'svelte/store';


  export let caseId: string;
  export let onEvidenceDrop: (evidence: Evidence) => void = () => {};

  const evidenceList = writable<Evidence[]>([]);
  const isUploading = writable(false);
  const dispatcher = createEventDispatcher();

  async function fetchEvidence() {
    const res = await fetch(`/api/evidence?caseId=${caseId}`);
    if (res.ok) {
      evidenceList.set(await res.json());
}}
  async function handleUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    isUploading.set(true);
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('caseId', caseId);
    try {
      const res = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        console.log('Evidence uploaded!');
        await fetchEvidence();
      } else {
        console.error('Upload failed');
}
    } finally {
      isUploading.set(false);
      input.value = '';
}}
  function handleDragStart(ev: DragEvent, evd: Evidence) {
    ev.dataTransfer?.setData('application/json', JSON.stringify(evd));
    ev.dataTransfer!.effectAllowed = 'copy';
}
  onMount(fetchEvidence);
</script>

<section class="container mx-auto px-4">
  <h2 class="container mx-auto px-4">Evidence</h2>
  <div class="container mx-auto px-4">
    <label class="container mx-auto px-4">
      <input type="file" accept="*" on:change={handleUpload} style="display:none" />
      Upload Evidence
    </label>
    {#if $isUploading}
      <span class="container mx-auto px-4">Uploading...</span>
    {/if}
  </div>
  <div class="container mx-auto px-4">
    {#each $evidenceList as evd (evd.id)}
      <div class="container mx-auto px-4" draggable={true} on:dragstart={(e) => handleDragStart(e, evd)} role="button" tabindex={0} aria-label="Drag evidence item">
        <div class="container mx-auto px-4">
          <span class="container mx-auto px-4">{evd.fileType}</span>
          <span class="container mx-auto px-4">{Array.isArray(evd.tags) ? evd.tags.join(', ') : ''}</span>
        </div>
        <div class="container mx-auto px-4">{evd.title}</div>
        <div class="container mx-auto px-4">{evd.description}</div>
      </div>
    {/each}
  </div>
</section>

<style>
  /* @unocss-include */
.evidence-panel {
  background: var(--pico-background, #fff);
  border-radius: 1rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  padding: 1.5rem;
  margin-bottom: 2rem;
}
.evidence-title {
  font-size: 1.3rem;
  margin-bottom: 1rem;
}
.evidence-upload {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}
.evidence-upload-btn {
  --uno: bg-primary text-white rounded px-4 py-2 shadow hover:bg-primary-600 transition;
}
.uploading {
  color: var(--pico-primary, #007bff);
}
.evidence-list {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.evidence-card {
  --uno: bg-gray-50 border border-gray-200 rounded p-3 shadow hover:shadow-lg cursor-grab transition;
  min-width: 180px;
  max-width: 220px;
  user-select: none;
}
.evidence-card:active {
  cursor: grabbing;
}
.evidence-meta {
  font-size: 0.85em;
  color: #888;
  margin-bottom: 0.5em;
  display: flex;
  gap: 0.5em;
}
.evidence-tags {
  --uno: text-xs bg-primary/10 px-2 py-0.5 rounded;
}
.evidence-desc {
  color: #444;
  font-size: 0.95em;
  margin-top: 0.5em;
}
</style>
