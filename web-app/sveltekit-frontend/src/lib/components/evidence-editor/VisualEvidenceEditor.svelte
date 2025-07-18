<script lang="ts">
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import CanvasEditor from './CanvasEditor.svelte';
  import InspectorPanel from './InspectorPanel.svelte';
  import AIAssistantPanel from './AIAssistantPanel.svelte';
  
  // Store for selected node
  export const selectedNode = writable(null);
  
  // Props
  export let caseId: string | null = null;
  export let readOnly = false;
  
  let canvasComponent: CanvasEditor;
  let currentSelectedNode: any = null;
  
  // Subscribe to selected node changes
  selectedNode.subscribe(node => {
    currentSelectedNode = node;
  });
  
  function handleNodeSelect(event: CustomEvent) {
    selectedNode.set(event.detail);
}
  function handleNodeSave(event: CustomEvent) {
    // Handle saving node data
    const nodeData = event.detail;
    console.log('Saving node:', nodeData);
    
    // TODO: Implement actual save to database
    // await fetch('/api/evidence', { method: 'POST', body: JSON.stringify(nodeData) });
}
</script>

<div class="container mx-auto px-4">
  <!-- Golden Ratio Layout: 61.8% main canvas, 19.1% inspector, 19.1% AI assistant -->
  <div class="container mx-auto px-4">
    
    <!-- Main Canvas Area -->
    <div class="container mx-auto px-4">
      <CanvasEditor 
        bind:this={canvasComponent}
        {caseId}
        {readOnly}
        on:nodeSelect={handleNodeSelect}
        on:nodeSave={handleNodeSave}
      />
    </div>
    
    <!-- Inspector Panel -->
    <div class="container mx-auto px-4">
      <InspectorPanel 
        selectedNode={currentSelectedNode}
        {readOnly}
        on:save={handleNodeSave}
      />
    </div>
    
    <!-- AI Assistant Panel -->
    <div class="container mx-auto px-4">
      <AIAssistantPanel 
        selectedNode={currentSelectedNode}
        on:tagsUpdate={(e) => {
          if (currentSelectedNode) {
            currentSelectedNode.aiTags = e.detail;
            selectedNode.update(n => ({ ...n, aiTags: e.detail }));
}
        "
      />
    </div>
    
  </div>
</div>

<style>
  /* @unocss-include */
  .visual-evidence-editor {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .visual-evidence-editor :global(.grid) {
      grid-template-columns: 1fr;
      grid-template-rows: 60% 20% 20%;
}
}
</style>
