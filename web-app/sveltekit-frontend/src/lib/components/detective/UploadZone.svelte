<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let minimal = false; // New prop for minimal canvas mode
  
  let isDragOver = false;
  let isUploading = false;
  let uploadProgress = 0;
  let fileInput: HTMLInputElement;
  
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragOver = true;}
  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;}
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileUpload(files);}}
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      handleFileUpload(target.files);}}
  async function handleFileUpload(files: FileList) {
    isUploading = true;
    uploadProgress = 0;
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await uploadFile(file);
        uploadProgress = ((i + 1) / files.length) * 100;}
      dispatch('upload', files);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      isUploading = false;
      uploadProgress = 0;}}
  async function uploadFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          uploadProgress = progress;}
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve();
        } else {
          reject(new Error('Upload failed'));}
      });
      
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });
      
      const formData = new FormData();
      formData.append('file', file);
      
      xhr.open('POST', '/api/evidence/upload');
      xhr.send(formData);
    });}
  function openFileDialog() {
    fileInput.click();}
</script>

<input 
  type="file" 
  bind:this={fileInput}
  on:change={handleFileSelect}
  multiple
  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
  class="container mx-auto px-4"
/>

{#if minimal}
  <!-- Minimal Upload Button for Canvas -->
  <button
    class="container mx-auto px-4"
    on:click={() => openFileDialog()}
    title="Upload Evidence"
    aria-label="Upload Evidence"
    tabindex={0}
  >
    <i class="container mx-auto px-4" aria-hidden="true"></i>
  </button>
{:else}
  <!-- Full Upload Zone for Columns -->
  <div 
    class="container mx-auto px-4"
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
    role="button"
    tabindex={0}
    aria-label="Upload Evidence Dropzone"
    on:click={() => openFileDialog()}
    on:keydown={(e) => e.key === 'Enter' && openFileDialog()}
  >
    {#if isUploading}
      <!-- Upload Progress -->
      <div class="container mx-auto px-4">
        <div class="container mx-auto px-4">
          <div class="container mx-auto px-4"></div>
        </div>
        <div>
          <p class="container mx-auto px-4">Uploading evidence...</p>
          <div class="container mx-auto px-4">
            <div 
              class="container mx-auto px-4"
              style="width: {uploadProgress}%"
            ></div>
          </div>
          <p class="container mx-auto px-4">{Math.round(uploadProgress)}% complete</p>
        </div>
      </div>
    {:else}
      <!-- Upload Interface -->
      <div class="container mx-auto px-4">
        <div class="container mx-auto px-4">
          <i class="container mx-auto px-4" aria-hidden="true"></i>
        </div>
        <div>
          <p class="container mx-auto px-4">Drop evidence files here</p>
          <p class="container mx-auto px-4">
            or <span class="container mx-auto px-4">browse files</span>
          </p>
        </div>
        <div class="container mx-auto px-4">
          <p>Supports: Images, Videos, Audio, Documents</p>
          <p>Max file size: 100MB</p>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* @unocss-include */
  .upload-zone {
    cursor: pointer;}
  .upload-zone:hover {
    transform: translateY(-1px);}
  .hidden {
    display: none;}
</style>
