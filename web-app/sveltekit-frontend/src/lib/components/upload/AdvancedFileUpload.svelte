<script lang="ts">
  import { browser } from "$app/environment";
  import Button from "$lib/components/ui/Button.svelte";
  import { notifications } from "$lib/stores/notification";
  import { FocusManager } from "$lib/utils/accessibility";
  import {
    AlertTriangle,
    Camera,
    Eye,
    File as FileIcon,
    FileText,
    Image as ImageIcon,
    Loader2,
    Mic,
    Paperclip,
    Trash2,
    Upload,
    Video,
  } from "lucide-svelte";
  import { createEventDispatcher, onMount } from "svelte";

  const dispatch = createEventDispatcher();

  // Props
  export let multiple = true;
  export let accept = "*/*";
  export let maxFileSize = 100 * 1024 * 1024; // 100MB
  export let maxTotalSize = 500 * 1024 * 1024; // 500MB
  export let maxFiles = 10;
  export let allowedTypes: string[] = [];
  export let uploadUrl = "/api/upload";
  export let chunkSize = 1024 * 1024; // 1MB chunks for large files
  export let enableChunking = true;
  export let enablePreview = true;
  export const enableDragDrop = true;
  export let enablePasteUpload = true;
  export let enableCameraCapture = false;
  export let enableAudioRecording = false;
  export let autoUpload = false;
  export let compressionQuality = 0.8;
  export let enableCompression = true;
  export let showProgress = true;
  export let disabled = false;

  // State
  let fileInput: HTMLInputElement;
  let dropZone: HTMLElement;
  let files: FileUploadItem[] = [];
  let isDragOver = false;
  let isUploading = false;
  let totalProgress = 0;
  let uploadQueue: FileUploadItem[] = [];
  let mediaRecorder: MediaRecorder | null = null;
  let isRecording = false;
  let recordingStream: MediaStream | null = null;

  interface FileUploadItem {
    id: string;
    file: File;
    name: string;
    size: number;
    type: string;
    progress: number;
    status: "pending" | "uploading" | "success" | "error" | "paused";
    error?: string;
    preview?: string;
    chunks?: Blob[];
    uploadedChunks?: number;
    totalChunks?: number;
    url?: string;
    thumbnailUrl?: string;}
  onMount(() => {
    if (browser && enablePasteUpload) {
      document.addEventListener("paste", handlePaste);}
    return () => {
      if (browser && enablePasteUpload) {
        document.removeEventListener("paste", handlePaste);}
      if (recordingStream) {
        recordingStream.getTracks().forEach((track) => track.stop());}
    };
  });

  function generateId(): string {
    return Math.random().toString(36).substr(2, 9);}
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      addFiles(Array.from(target.files));}}
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;

    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    addFiles(droppedFiles);}
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragOver = true;}
  function handleDragLeave() {
    isDragOver = false;}
  function handlePaste(event: ClipboardEvent) {
    if (!enablePasteUpload || disabled) return;

    const items = Array.from(event.clipboardData?.items || []);
    const files = items
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];

    if (files.length > 0) {
      addFiles(files);
      notifications.add({
        type: "info",
        title: "Files Pasted",
        message: `${files.length} file(s) added from clipboard`,
      });}}
  async function addFiles(newFiles: File[]) {
    if (disabled) return;

    // Validate file count
    if (files.length + newFiles.length > maxFiles) {
      notifications.add({
        type: "error",
        title: "Too Many Files",
        message: `Maximum ${maxFiles} files allowed`,
      });
      return;}
    // Validate and process files
    const validFiles: FileUploadItem[] = [];

    for (const file of newFiles) {
      // Validate file type
      if (
        allowedTypes.length > 0 &&
        !allowedTypes.some((type) => file.type.startsWith(type))
      ) {
        notifications.add({
          type: "error",
          title: "Invalid File Type",
          message: `${file.name} is not a supported file type`,
        });
        continue;}
      // Validate file size
      if (file.size > maxFileSize) {
        notifications.add({
          type: "error",
          title: "File Too Large",
          message: `${file.name} exceeds maximum size of ${formatFileSize(maxFileSize)}`,
        });
        continue;}
      // Create file item
      const fileItem: FileUploadItem = {
        id: generateId(),
        file: enableCompression ? await compressFile(file) : file,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: "pending",
      };

      // Generate preview if enabled
      if (enablePreview && file.type.startsWith("image/")) {
        fileItem.preview = await generatePreview(file);}
      validFiles.push(fileItem);}
    // Check total size
    const totalSize = [...files, ...validFiles].reduce(
      (sum, item) => sum + item.size,
      0
    );
    if (totalSize > maxTotalSize) {
      notifications.add({
        type: "error",
        title: "Total Size Exceeded",
        message: `Total size cannot exceed ${formatFileSize(maxTotalSize)}`,
      });
      return;}
    files = [...files, ...validFiles];

    if (autoUpload) {
      uploadFiles(validFiles.map((f) => f.id));}
    // Announce to screen reader
    FocusManager.announceToScreenReader(
      `${validFiles.length} file(s) added. Total: ${files.length} files`
    );

    dispatch("filesAdded", { files: validFiles });}
  async function compressFile(file: File): Promise<File> {
    if (!enableCompression || !file.type.startsWith("image/")) {
      return file;}
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions (max 1920x1080)
        const maxWidth = 1920;
        const maxHeight = 1080;
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;}
        canvas.width = width;
        canvas.height = height;

        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: file.lastModified,
              });
              resolve(compressedFile);
            } else {
              resolve(file);}
          },
          file.type,
          compressionQuality
        );
      };

      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });}
  async function generatePreview(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });}
  async function uploadFiles(fileIds?: string[]) {
    const filesToUpload = fileIds
      ? files.filter((f) => fileIds.includes(f.id))
      : files.filter((f) => f.status === "pending");

    if (filesToUpload.length === 0) return;

    isUploading = true;

    for (const fileItem of filesToUpload) {
      await uploadFile(fileItem);}
    isUploading = false;
    updateTotalProgress();

    dispatch("uploadComplete", { files: filesToUpload });}
  async function uploadFile(fileItem: FileUploadItem) {
    fileItem.status = "uploading";
    fileItem.progress = 0;

    try {
      if (enableChunking && fileItem.size > chunkSize) {
        await uploadFileInChunks(fileItem);
      } else {
        await uploadFileWhole(fileItem);}
      fileItem.status = "success";
      fileItem.progress = 100;

      notifications.add({
        type: "success",
        title: "Upload Complete",
        message: `${fileItem.name} uploaded successfully`,
      });
    } catch (error) {
      fileItem.status = "error";
      fileItem.error = error instanceof Error ? error.message : "Upload failed";

      notifications.add({
        type: "error",
        title: "Upload Failed",
        message: `Failed to upload ${fileItem.name}: ${fileItem.error}`,
      });}
    updateTotalProgress();}
  async function uploadFileWhole(fileItem: FileUploadItem) {
    const formData = new FormData();
    formData.append("file", fileItem.file);
    formData.append("filename", fileItem.name);

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);}
    const result = await response.json();
    fileItem.url = result.url;
    fileItem.thumbnailUrl = result.thumbnailUrl;}
  async function uploadFileInChunks(fileItem: FileUploadItem) {
    const totalChunks = Math.ceil(fileItem.size / chunkSize);
    fileItem.totalChunks = totalChunks;
    fileItem.uploadedChunks = 0;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, fileItem.size);
      const chunk = fileItem.file.slice(start, end);

      const formData = new FormData();
      formData.append("chunk", chunk);
      formData.append("chunkIndex", chunkIndex.toString());
      formData.append("totalChunks", totalChunks.toString());
      formData.append("filename", fileItem.name);
      formData.append("fileId", fileItem.id);

      const response = await fetch(`${uploadUrl}/chunk`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);}
      fileItem.uploadedChunks = chunkIndex + 1;
      fileItem.progress = (fileItem.uploadedChunks / totalChunks) * 100;}
    // Finalize chunked upload
    const finalizeResponse = await fetch(`${uploadUrl}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId: fileItem.id,
        filename: fileItem.name,
        totalChunks,
      }),
    });

    if (!finalizeResponse.ok) {
      throw new Error("Failed to finalize upload");}
    const result = await finalizeResponse.json();
    fileItem.url = result.url;
    fileItem.thumbnailUrl = result.thumbnailUrl;}
  function updateTotalProgress() {
    if (files.length === 0) {
      totalProgress = 0;
      return;}
    const totalProgressSum = files.reduce(
      (sum, file) => sum + file.progress,
      0
    );
    totalProgress = totalProgressSum / files.length;}
  function removeFile(fileId: string) {
    files = files.filter((f) => f.id !== fileId);
    updateTotalProgress();

    FocusManager.announceToScreenReader("File removed");
    dispatch("fileRemoved", { fileId });}
  function retryUpload(fileId: string) {
    const fileItem = files.find((f) => f.id === fileId);
    if (fileItem) {
      fileItem.status = "pending";
      fileItem.progress = 0;
      fileItem.error = undefined;
      uploadFiles([fileId]);}}
  // Wrapper functions to handle event propagation
  function handleCameraCaptureClick(event: CustomEvent | Event) {
    event.stopPropagation();
    startCameraCapture();}
  function handleAudioRecordingClick(event: CustomEvent | Event) {
    event.stopPropagation();
    if (isRecording) {
      stopAudioRecording();
    } else {
      startAudioRecording();}}
  async function startCameraCapture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      // Create video element for camera feed
      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;

      // Take photo logic would go here
      // For now, just stop the stream
      stream.getTracks().forEach((track) => track.stop());

      notifications.add({
        type: "info",
        title: "Camera Access",
        message: "Camera capture feature would be implemented here",
      });
    } catch (error) {
      notifications.add({
        type: "error",
        title: "Camera Error",
        message: "Could not access camera",
      });}}
  async function startAudioRecording() {
    if (isRecording) {
      stopAudioRecording();
      return;}
    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaRecorder = new MediaRecorder(recordingStream);

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: "audio/wav" });
        const audioFile = new File([audioBlob], `recording-${Date.now()}.wav`, {
          type: "audio/wav",
        });
        addFiles([audioFile]);
      };

      mediaRecorder.start();
      isRecording = true;

      notifications.add({
        type: "info",
        title: "Recording Started",
        message: "Audio recording in progress...",
      });
    } catch (error) {
      notifications.add({
        type: "error",
        title: "Recording Error",
        message: "Could not start audio recording",
      });}}
  function stopAudioRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;

      if (recordingStream) {
        recordingStream.getTracks().forEach((track) => track.stop());
        recordingStream = null;}
      notifications.add({
        type: "success",
        title: "Recording Complete",
        message: "Audio recording saved",
      });}}
  function formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;}
    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;}
  function getFileIcon(type: string) {
    if (type.startsWith("image/")) return ImageIcon;
    if (type.startsWith("video/")) return Video;
    if (type.startsWith("text/") || type.includes("document")) return FileText;
    return FileIcon;}
  function getStatusColor(status: string) {
    switch (status) {
      case "success":
        return "text-green-600";
      case "error":
        return "text-red-600";
      case "uploading":
        return "text-blue-600";
      default:
        return "text-gray-600";}}
</script>

<div class="container mx-auto px-4" class:disabled>
  <!-- Drop zone -->
  <div
    bind:this={dropZone}
    class="container mx-auto px-4"
    class:drag-over={isDragOver}
    class:disabled
    on:drop={handleDrop}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    role="button"
    tabindex={0}
    aria-label="File upload area. Click to select files or drag and drop files here."
    on:click={() => !disabled && fileInput.click()}
    on:keydown={(e) => {
      if ((e.key === "Enter" || e.key === " ") && !disabled) {
        e.preventDefault();
        fileInput.click();}
      }
    }}
  >
    <div class="container mx-auto px-4">
      <div class="container mx-auto px-4">
        <Upload class="container mx-auto px-4" />
      </div>

      <div class="container mx-auto px-4">
        <h3 class="container mx-auto px-4">
          {isDragOver ? "Drop files here" : "Upload Files"}
        </h3>
        <p class="container mx-auto px-4">
          Click to browse or drag and drop files
          {#if enablePasteUpload}
            or paste from clipboard
          {/if}
        </p>

        <div class="container mx-auto px-4">
          <p>Max file size: {formatFileSize(maxFileSize)}</p>
          <p>Max total: {formatFileSize(maxTotalSize)}</p>
          <p>Max files: {maxFiles}</p>
        </div>
      </div>

      <div class="container mx-auto px-4">
        <Button {disabled}>
          <Paperclip class="container mx-auto px-4" />
          Choose Files
        </Button>

        {#if enableCameraCapture}
          <Button
            variant="secondary"
            on:click={handleCameraCaptureClick}
            {disabled}
          >
            <Camera class="container mx-auto px-4" />
            Camera
          </Button>
        {/if}

        {#if enableAudioRecording}
          <Button
            variant="secondary"
            on:click={handleAudioRecordingClick}
            {disabled}
            class={isRecording ? "bg-red-100 text-red-700" : ""}
          >
            <Mic class="container mx-auto px-4" />
            {isRecording ? "Stop Recording" : "Record Audio"}
          </Button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Hidden file input -->
  <input
    bind:this={fileInput}
    type="file"
    {multiple}
    {accept}
    {disabled}
    on:change={handleFileSelect}
    class="container mx-auto px-4"
    aria-hidden="true"
  />

  <!-- File list -->
  {#if files.length > 0}
    <div class="container mx-auto px-4" role="region" aria-label="Selected files">
      <div class="container mx-auto px-4">
        <h4 class="container mx-auto px-4">
          Selected Files ({files.length}/{maxFiles})
        </h4>

        <div class="container mx-auto px-4">
          {#if !autoUpload && files.some((f) => f.status === "pending")}
            <Button
              size="sm"
              on:click={() => uploadFiles()}
              disabled={isUploading}
            >
              {#if isUploading}
                <Loader2 class="container mx-auto px-4" />
              {:else}
                <Upload class="container mx-auto px-4" />
              {/if}
              Upload All
            </Button>
          {/if}

          <Button
            variant="ghost"
            size="sm"
            on:click={() => (files = [])}
            disabled={isUploading}
          >
            Clear All
          </Button>
        </div>
      </div>

      <!-- Total progress -->
      {#if showProgress && isUploading}
        <div class="container mx-auto px-4">
          <div class="container mx-auto px-4">
            <div class="container mx-auto px-4" style="width: {totalProgress}%"></div>
          </div>
          <span class="container mx-auto px-4">{Math.round(totalProgress)}%</span>
        </div>
      {/if}

      <!-- Individual files -->
      <div class="container mx-auto px-4">
        {#each files as file (file.id)}
          <div class="container mx-auto px-4" class:uploading={file.status === "uploading"}>
            <!-- Preview -->
            {#if file.preview}
              <div class="container mx-auto px-4">
                <img src={file.preview} alt={file.name} />
              </div>
            {:else}
              <div class="container mx-auto px-4">
                <svelte:component
                  this={getFileIcon(file.type)}
                  class="container mx-auto px-4"
                />
              </div>
            {/if}

            <!-- File info -->
            <div class="container mx-auto px-4">
              <div class="container mx-auto px-4" title={file.name}>
                {file.name}
              </div>
              <div class="container mx-auto px-4">
                <span class="container mx-auto px-4">{formatFileSize(file.size)}</span>
                <span class="container mx-auto px-4">
                  {file.status}
                </span>
                {#if file.error}
                  <span class="container mx-auto px-4" title={file.error}>
                    <AlertTriangle class="container mx-auto px-4" />
                  </span>
                {/if}
              </div>

              <!-- Progress bar -->
              {#if file.status === "uploading" && showProgress}
                <div class="container mx-auto px-4">
                  <div class="container mx-auto px-4">
                    <div
                      class="container mx-auto px-4"
                      style="width: {file.progress}%"
                    ></div>
                  </div>
                  <span class="container mx-auto px-4">{Math.round(file.progress)}%</span
                  >
                </div>
              {/if}
            </div>

            <!-- Actions -->
            <div class="container mx-auto px-4">
              {#if file.status === "success" && file.url}
                <Button
                  variant="ghost"
                  size="sm"
                  on:click={() => window.open(file.url, "_blank")}
                  aria-label="View {file.name}"
                >
                  <Eye class="container mx-auto px-4" />
                </Button>
              {/if}

              {#if file.status === "error"}
                <Button
                  variant="ghost"
                  size="sm"
                  on:click={() => retryUpload(file.id)}
                  aria-label="Retry upload of {file.name}"
                >
                  <Upload class="container mx-auto px-4" />
                </Button>
              {/if}

              <Button
                variant="ghost"
                size="sm"
                on:click={() => removeFile(file.id)}
                disabled={file.status === "uploading"}
                aria-label="Remove {file.name}"
              >
                <Trash2 class="container mx-auto px-4" />
              </Button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* @unocss-include */
  .advanced-file-upload {
    width: 100%;}
  .drop-zone {
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 3rem 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: #fafafa;}
  .drop-zone:hover:not(.disabled) {
    border-color: #3b82f6;
    background: #eff6ff;}
  .drop-zone.drag-over {
    border-color: #3b82f6;
    background: #eff6ff;
    transform: scale(1.02);}
  .drop-zone.disabled {
    opacity: 0.6;
    cursor: not-allowed;}
  .drop-zone:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;}
  .upload-icon {
    margin-bottom: 1rem;
    color: #6b7280;}
  .upload-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 1rem;}
  .file-list {
    margin-top: 2rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;}
  .file-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;}
  .file-list-actions {
    display: flex;
    gap: 0.5rem;}
  .total-progress {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;}
  .progress-bar {
    flex: 1;
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    overflow: hidden;}
  .progress-fill {
    height: 100%;
    background: #3b82f6;
    transition: width 0.3s ease;}
  .progress-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    min-width: 3rem;
    text-align: right;}
  .files {
    max-height: 400px;
    overflow-y: auto;}
  .file-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
    transition: background-color 0.2s ease;}
  .file-item:last-child {
    border-bottom: none;}
  .file-item:hover {
    background: #f9fafb;}
  .file-item.uploading {
    background: #eff6ff;}
  .file-preview {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;}
  .file-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;}
  .file-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
    border-radius: 6px;
    color: #6b7280;
    flex-shrink: 0;}
  .file-info {
    flex: 1;
    min-width: 0;}
  .file-name {
    font-weight: 500;
    color: #111827;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    margin-bottom: 0.25rem;}
  .file-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: #6b7280;}
  .file-error {
    color: #ef4444;
    display: flex;
    align-items: center;}
  .file-progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;}
  .file-progress .progress-bar {
    height: 4px;}
  .file-progress .progress-text {
    font-size: 0.75rem;
    min-width: 2.5rem;}
  .file-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;}
  /* Responsive design */
  @media (max-width: 640px) {
    .drop-zone {
      padding: 2rem 1rem;}
    .upload-actions {
      flex-direction: column;
      align-items: center;}
    .file-list-header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;}
    .file-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;}
    .file-actions {
      align-self: flex-end;}}
  /* High contrast mode */
  @media (prefers-contrast: high) {
    .drop-zone {
      border-width: 3px;}
    .file-item {
      border-bottom-width: 2px;}}
  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .drop-zone,
    .file-item,
    .progress-fill {
      transition: none !important;}
    .drop-zone.drag-over {
      transform: none;}}
</style>
