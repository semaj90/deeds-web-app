<script lang="ts">
  import TauriAPI from "$lib/tauri";
  import type { Report } from "$lib/types/index";
  import { onMount } from "svelte";

  let reports: Report[] = [];
  let loading = true;
  let error: string | null = null;

  onMount(async () => {
    try {
      reports = await TauriAPI.getReports();
    } catch (err) {
      error = "Error loading reports";
      console.error("Error:", err);
    } finally {
      loading = false;}
  });

  function formatDate(date: Date | string) {
    if (typeof date === 'string') {
      return new Date(date).toLocaleDateString();}
    return date.toLocaleDateString();}
  function getStatusBadgeClass(status: string) {
    switch (status) {
      case "published":
        return "badge-success";
      case "draft":
        return "badge-warning";
      case "archived":
        return "badge-neutral";
      default:
        return "badge-info";}}
</script>

<svelte:head>
  <title>Reports - Legal Case Management</title>
</svelte:head>

<div class="container mx-auto px-4">
  <div class="container mx-auto px-4">
    <h1 class="container mx-auto px-4">Reports</h1>
    <a href="/report-builder" class="container mx-auto px-4">
      <svg
        class="container mx-auto px-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
        />
      </svg>
      New Report
    </a>
  </div>

  {#if loading}
    <div class="container mx-auto px-4">
      <div class="container mx-auto px-4"></div>
      <span class="container mx-auto px-4">Loading reports...</span>
    </div>
  {:else if error}
    <div class="container mx-auto px-4">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="container mx-auto px-4"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{error}</span>
    </div>
  {:else if reports.length === 0}
    <div class="container mx-auto px-4">
      <svg
        class="container mx-auto px-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <h3 class="container mx-auto px-4">No reports</h3>
      <p class="container mx-auto px-4">
        Get started by creating a new report.
      </p>
      <div class="container mx-auto px-4">
        <a href="/report-builder" class="container mx-auto px-4">
          <svg
            class="container mx-auto px-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          New Report
        </a>
      </div>
    </div>
  {:else}
    <div class="container mx-auto px-4">
      {#each reports as report}
        <div class="container mx-auto px-4">
          <div class="container mx-auto px-4">
            <div class="container mx-auto px-4">
              <div class="container mx-auto px-4">
                <h2 class="container mx-auto px-4">
                  <a href="/reports/{report.id}" class="container mx-auto px-4"
                    >{report.title}</a
                  >
                </h2>
                <p class="container mx-auto px-4">{report.summary}</p>

                <div class="container mx-auto px-4">
                  <span>Type: {report.reportType}</span>
                  <span>Created: {formatDate(report.createdAt)}</span>
                  <span>Words: {report.wordCount || 0}</span>
                  {#if report.estimatedReadTime}
                    <span>Read time: {report.estimatedReadTime} min</span>
                  {/if}
                </div>

                {#if report.tags && report.tags.length > 0}
                  <div class="container mx-auto px-4">
                    {#each report.tags as tag}
                      <span class="container mx-auto px-4">{tag}</span>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="container mx-auto px-4">
                <span class="container mx-auto px-4"
                  >{report.status}</span
                >

                <div class="container mx-auto px-4">
                  <button
                    tabindex={0}
                    class="container mx-auto px-4"
                    aria-label="Actions menu"
                  >
                    <svg
                      class="container mx-auto px-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"
                      />
                    </svg>
                  </button>
                  <ul
                    class="container mx-auto px-4"
                  >
                    <li><a href="/reports/{report.id}">View</a></li>
                    <li><a href="/reports/{report.id}/edit">Edit</a></li>
                    <li>
                      <a
                        href="/api/reports/{report.id}/export/pdf"
                        target="_blank">Export PDF</a
                      >
                    </li>
                    <li><button class="container mx-auto px-4">Delete</button></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
