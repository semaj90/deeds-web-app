import type { User } from '$lib/types';

<script lang="ts">
  import { browser } from "$app/environment";
  import { Tooltip } from "$lib/components/ui";
  import { Button } from "$lib/components/ui/button";
  import { notifications } from "$lib/stores/notification";
  import {
    AlertCircle,
    CheckCircle,
    Database,
    Download,
    Eye,
    FileText,
    Upload,
    Users,
    X,
  } from "lucide-svelte";
  import { onMount } from "svelte";

  // Import state
  let importFile: File | null = null;
  let importType = "all";
  let overwriteExisting = false;
  let isImporting = false;
  let importResults: {
    success: boolean;
    message: string;
    data?: unknown;
    results?: {
      imported: number;
      updated: number;
      skipped: number;
      errors: string[];
    };
    error?: string;
  } | null = null;
  let filePreview: {
    name: string;
    size: number;
    type: string;
    content?: string;
    data?: any;
    raw?: string;
  } | null = null;
  let dragActive = false;

  // File input reference
  let fileInput: HTMLInputElement;

  // Supported file types
  const supportedTypes = [
    { value: "all", label: "Complete Export (All Data)", icon: Database },
    { value: "cases", label: "Cases Only", icon: FileText },
    { value: "evidence", label: "Evidence Only", icon: FileText },
    { value: "participants", label: "Participants Only", icon: Users },
  ];

  // Example data formats
  const exampleFormats = {
    cases: {
      json: `[
  {
    "id": "optional-existing-id",
    "title": "Case Title",
    "description": "Case description",
    "status": "active|closed|pending",
    "priority": "low|medium|high|urgent",
    "created_at": "2024-01-01T00:00:00Z"
}
]`,
      csv: `title,description,status,priority
"Fraud Investigation","Corporate fraud case","active","high"
"Theft Case","Retail theft investigation","pending","medium"`,
    },
    evidence: {
      json: `[
  {
    "case_id": "case-uuid",
    "type": "document|photo|video|audio|other",
    "description": "Evidence description",
    "file_path": "optional-file-path",
    "metadata": {"key": "value"}
}
]`,
      csv: `case_id,type,description,file_path
"case-uuid","document","Contract document","/files/contract.pdf"
"case-uuid","photo","Crime scene photo","/files/scene.jpg"`,
    },
  };

  onMount(() => {
    // Add drag and drop event listeners
    if (browser) {
      document.addEventListener("dragover", handleDragOver);
      document.addEventListener("drop", handleDrop);
      document.addEventListener("dragleave", handleDragLeave);

      return () => {
        document.removeEventListener("dragover", handleDragOver);
        document.removeEventListener("drop", handleDrop);
        document.removeEventListener("dragleave", handleDragLeave);
      };
}
    return () => {}; // Return empty cleanup function if not in browser
  });

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
}
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    if (!e.relatedTarget) {
      dragActive = false;
}
}
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
}
}
  function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      handleFileSelect(file);
}
}
  async function handleFileSelect(file: File) {
    importFile = file;
    importResults = null;

    // Validate file type
    const validTypes = [
      "application/json",
      "text/csv",
      "application/xml",
      "text/xml",
    ];
    if (
      !validTypes.includes(file.type) &&
      !file.name.endsWith(".json") &&
      !file.name.endsWith(".csv") &&
      !file.name.endsWith(".xml")
    ) {
      notifications.add({
        type: "error",
        title: "Invalid File Type",
        message: "Please select a JSON, CSV, or XML file",
      });
      importFile = null;
      return;
}
    // Generate file preview
    try {
      const content = await file.text();
      if (file.type === "application/json" || file.name.endsWith(".json")) {
        filePreview = {
          type: "json",
          data: JSON.parse(content),
          raw: content.substring(0, 500) + (content.length > 500 ? "..." : ""),
        };
      } else if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        const lines = content.split("\n").slice(0, 5);
        filePreview = {
          type: "csv",
          data: lines,
          raw: content.substring(0, 500) + (content.length > 500 ? "..." : ""),
        };
      } else {
        filePreview = {
          type: "xml",
          data: content.substring(0, 500) + (content.length > 500 ? "..." : ""),
          raw: content.substring(0, 500) + (content.length > 500 ? "..." : ""),
        };
}
    } catch (error) {
      notifications.add({
        type: "error",
        title: "Parse Error",
        message: "Failed to parse file. Please check the format.",
      });
      importFile = null;
      filePreview = null;
}
}
  async function performImport() {
    if (!importFile) return;

    isImporting = true;
    importResults = null;

    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("type", importType);
      formData.append("overwrite", overwriteExisting.toString());

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        importResults = result;
        notifications.add({
          type: "success",
          title: "Import Successful",
          message: result.message,
        });
      } else {
        throw new Error(result.error || "Import failed");
}
    } catch (error) {
      console.error("Import error:", error);
      notifications.add({
        type: "error",
        title: "Import Failed",
        message: error instanceof Error ? error.message : "Import failed",
      });
    } finally {
      isImporting = false;
}
}
  function clearImport() {
    importFile = null;
    filePreview = null;
    importResults = null;
    if (fileInput) fileInput.value = "";
}
  function downloadExampleTemplate(type: string, format: string) {
    const data = exampleFormats[type as keyof typeof exampleFormats];
    if (!data) return;

    const content = data[format as keyof typeof data];
    const blob = new Blob([content], {
      type: format === "json" ? "application/json" : "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `example-${type}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
</script>

<svelte:head>
  <title>Data Import - Legal Case Management</title>
  <meta
    name="description"
    content="Import cases, evidence, and participant data from JSON, CSV, or XML files"
  />
</svelte:head>

<div class="container mx-auto px-4">
  <!-- Header -->
  <div
    class="container mx-auto px-4"
  >
    <h1 class="container mx-auto px-4">
      <Upload class="container mx-auto px-4" />
      Data Import
    </h1>
    <p class="container mx-auto px-4">
      Import cases, evidence, and participant data from JSON, CSV, or XML files
    </p>
  </div>

  <div class="container mx-auto px-4">
    <!-- Main Import Panel -->
    <div class="container mx-auto px-4">
      <!-- File Upload Section -->
      <div class="container mx-auto px-4">
        <h2 class="container mx-auto px-4">
          <FileText class="container mx-auto px-4" />
          Select Import File
        </h2>

        <!-- Drag and Drop Area -->
        <div
          class="container mx-auto px-4"
          class:border-blue-400={dragActive}
          class:bg-blue-50={dragActive}
          class:border-gray-300={!dragActive}
        >
          {#if importFile}
            <div class="container mx-auto px-4">
              <div class="container mx-auto px-4">
                <FileText class="container mx-auto px-4" />
                <div class="container mx-auto px-4">
                  <p class="container mx-auto px-4">{importFile.name}</p>
                  <p class="container mx-auto px-4">
                    {(importFile.size / 1024).toFixed(1)} KB • {importFile.type ||
                      "Unknown type"}
                  </p>
                </div>
              </div>
              <div class="container mx-auto px-4">
                <Tooltip content="Preview file contents">
                  <Button variant="outline" size="sm" disabled={!filePreview}>
                    <Eye class="container mx-auto px-4" />
                    Preview
                  </Button>
                </Tooltip>
                <Tooltip content="Remove selected file">
                  <Button
                    variant="outline"
                    size="sm"
                    on:click={() => clearImport()}
                  >
                    <X class="container mx-auto px-4" />
                    Remove
                  </Button>
                </Tooltip>
              </div>
            </div>
          {:else}
            <div class="container mx-auto px-4">
              <Upload class="container mx-auto px-4" />
              <div>
                <p class="container mx-auto px-4">
                  Drop your file here
                </p>
                <p class="container mx-auto px-4">or click to browse</p>
              </div>
              <Button variant="outline" on:click={() => fileInput?.click()}>
                Select File
              </Button>
            </div>
          {/if}
        </div>

        <!-- Hidden file input -->
        <input
          bind:this={fileInput}
          type="file"
          accept=".json,.csv,.xml"
          on:change={handleFileInput}
          class="container mx-auto px-4"
          aria-label="Select import file"
        />

        <!-- Import Options -->
        {#if importFile}
          <div class="container mx-auto px-4">
            <div>
              <label
                for="import-type"
                class="container mx-auto px-4"
              >
                Import Type
              </label>
              <select
                id="import-type"
                bind:value={importType}
                class="container mx-auto px-4"
              >
                {#each supportedTypes as type}
                  <option value={type.value}>{type.label}</option>
                {/each}
              </select>
            </div>

            <div class="container mx-auto px-4">
              <input
                id="overwrite"
                type="checkbox"
                bind:checked={overwriteExisting}
                class="container mx-auto px-4"
              />
              <label for="overwrite" class="container mx-auto px-4">
                Overwrite existing records with same ID
              </label>
              <Tooltip
                content="If enabled, existing records with matching IDs will be updated. Otherwise, they will be skipped."
              >
                <AlertCircle class="container mx-auto px-4" />
              </Tooltip>
            </div>
          </div>
        {/if}
      </div>

      <!-- File Preview Section -->
      {#if filePreview}
        <div class="container mx-auto px-4">
          <h3 class="container mx-auto px-4">
            <Eye class="container mx-auto px-4" />
            File Preview
          </h3>

          {#if filePreview.type === "json"}
            <div class="container mx-auto px-4">
              <pre
                class="container mx-auto px-4">{JSON.stringify(
                  filePreview.data,
                  null,
                  2
                ).substring(0, 1000)}{JSON.stringify(filePreview.data, null, 2)
                  .length > 1000
                  ? "\n..."
                  : ""}</pre>
            </div>
          {:else if filePreview.type === "csv"}
            <div class="container mx-auto px-4">
              <table class="container mx-auto px-4">
                <tbody>
                  {#each filePreview.data as row, i}
                    <tr class:bg-white={i % 2 === 0}>
                      {#each row.split(",") as cell}
                        <td class="container mx-auto px-4"
                          >{cell.replace(/"/g, "")}</td
                        >
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="container mx-auto px-4">
              <pre
                class="container mx-auto px-4">{filePreview.raw}</pre>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Import Results -->
      {#if importResults}
        <div class="container mx-auto px-4">
          <h3 class="container mx-auto px-4">
            {#if importResults.success}
              <CheckCircle class="container mx-auto px-4" />
            {:else}
              <AlertCircle class="container mx-auto px-4" />
            {/if}
            Import Results
          </h3>

          {#if importResults.success}
            <div class="container mx-auto px-4">
              <div class="container mx-auto px-4">
                <div class="container mx-auto px-4">
                  {importResults.results.imported}
                </div>
                <div class="container mx-auto px-4">Imported</div>
              </div>
              <div class="container mx-auto px-4">
                <div class="container mx-auto px-4">
                  {importResults.results.updated}
                </div>
                <div class="container mx-auto px-4">Updated</div>
              </div>
              <div class="container mx-auto px-4">
                <div class="container mx-auto px-4">
                  {importResults.results.skipped}
                </div>
                <div class="container mx-auto px-4">Skipped</div>
              </div>
            </div>

            {#if importResults.results.errors.length > 0}
              <div class="container mx-auto px-4">
                <h4 class="container mx-auto px-4">Errors:</h4>
                <ul class="container mx-auto px-4">
                  {#each importResults.results.errors as error}
                    <li>• {error}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          {:else}
            <div class="container mx-auto px-4">
              <p class="container mx-auto px-4">{importResults.error}</p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Import Action -->
      {#if importFile}
        <div class="container mx-auto px-4">
          <div class="container mx-auto px-4">
            <Button
              on:click={() => performImport()}
              disabled={isImporting}
              class="container mx-auto px-4"
            >
              {#if isImporting}
                <div
                  class="container mx-auto px-4"
                ></div>
                Importing...
              {:else}
                <Upload class="container mx-auto px-4" />
                Import Data
              {/if}
            </Button>
            <Tooltip content="Clear current import and start over">
              <Button variant="outline" on:click={() => clearImport()}>
                <X class="container mx-auto px-4" />
                Cancel
              </Button>
            </Tooltip>
          </div>
        </div>
      {/if}
    </div>

    <!-- Sidebar -->
    <div class="container mx-auto px-4">
      <!-- Example Templates -->
      <div class="container mx-auto px-4">
        <h3 class="container mx-auto px-4">
          <Download class="container mx-auto px-4" />
          Example Templates
        </h3>

        <div class="container mx-auto px-4">
          <div>
            <h4 class="container mx-auto px-4">Cases</h4>
            <div class="container mx-auto px-4">
              <Tooltip content="Download JSON example for cases">
                <Button
                  variant="outline"
                  size="sm"
                  on:click={() => downloadExampleTemplate("cases", "json")}
                >
                  JSON
                </Button>
              </Tooltip>
              <Tooltip content="Download CSV example for cases">
                <Button
                  variant="outline"
                  size="sm"
                  on:click={() => downloadExampleTemplate("cases", "csv")}
                >
                  CSV
                </Button>
              </Tooltip>
            </div>
          </div>

          <div>
            <h4 class="container mx-auto px-4">Evidence</h4>
            <div class="container mx-auto px-4">
              <Tooltip content="Download JSON example for evidence">
                <Button
                  variant="outline"
                  size="sm"
                  on:click={() => downloadExampleTemplate("evidence", "json")}
                >
                  JSON
                </Button>
              </Tooltip>
              <Tooltip content="Download CSV example for evidence">
                <Button
                  variant="outline"
                  size="sm"
                  on:click={() => downloadExampleTemplate("evidence", "csv")}
                >
                  CSV
                </Button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      <!-- Format Guidelines -->
      <div class="container mx-auto px-4">
        <h3 class="container mx-auto px-4">
          Import Guidelines
        </h3>
        <ul class="container mx-auto px-4">
          <li>• Use JSON for complex data with nested objects</li>
          <li>• Use CSV for simple tabular data</li>
          <li>• Include all required fields for each record</li>
          <li>• IDs are optional for new records</li>
          <li>• Dates should be in ISO 8601 format</li>
          <li>• Maximum file size: 10MB</li>
        </ul>
      </div>

      <!-- Quick Actions -->
      <div class="container mx-auto px-4">
        <h3 class="container mx-auto px-4">Quick Actions</h3>
        <div class="container mx-auto px-4">
          <a href="/export" class="container mx-auto px-4">
            <Button variant="outline" class="container mx-auto px-4">
              <Download class="container mx-auto px-4" />
              Export Data
            </Button>
          </a>
          <a href="/cases" class="container mx-auto px-4">
            <Button variant="outline" class="container mx-auto px-4">
              <Database class="container mx-auto px-4" />
              View Cases
            </Button>
          </a>
          <a href="/evidence" class="container mx-auto px-4">
            <Button variant="outline" class="container mx-auto px-4">
              <FileText class="container mx-auto px-4" />
              View Evidence
            </Button>
          </a>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* @unocss-include */
  /* Custom drag and drop styles */
  .container {
    min-height: calc(100vh - 200px);
}
</style>
