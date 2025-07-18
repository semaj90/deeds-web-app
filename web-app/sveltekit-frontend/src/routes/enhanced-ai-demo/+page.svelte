<!-- ====================================================================== -->
<!-- ENHANCED LEGAL AI SYSTEM DEMONSTRATION PAGE -->
<!-- Showcasing real-time AI processing with XState + Loki.js integration -->
<!-- ====================================================================== -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import EnhancedLegalAIDemo from '$lib/components/EnhancedLegalAIDemo.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/Card';
  import { Badge } from '$lib/components/ui/Badge';
  
  // Enhanced system initialization
  import { 
    initializeEnhancedMachines,
    evidenceProcessingStore,
    streamingStore 
  } from '$lib/stores/enhancedStateMachines';
  import { enhancedLoki, enhancedLokiStore } from '$lib/stores/enhancedLokiStore';
  
  let systemInitialized = false;
  let initializationProgress = 0;
  let initializationSteps = [
    'Initializing Loki.js database...',
    'Setting up XState machines...',
    'Connecting to WebSocket...',
    'Loading AI models...',
    'Syncing cache...',
    'System ready!'
  ];
  let currentStep = '';
  let showArchitectureDocs = false;
  let showImplementationGuide = false;

  onMount(async () => {
    await initializeSystem();
  });

  async function initializeSystem() {
    try {
      for (let i = 0; i < initializationSteps.length; i++) {
        currentStep = initializationSteps[i];
        initializationProgress = ((i + 1) / initializationSteps.length) * 100;
        
        await new Promise(resolve => setTimeout(resolve, 800)); // Visual delay for demo
        
        switch (i) {
          case 0:
            await enhancedLoki.init();
            break;
          case 1:
            await initializeEnhancedMachines();
            break;
          case 2:
            // WebSocket connection happens automatically
            break;
          case 3:
            // AI models are loaded on-demand
            break;
          case 4:
            // Cache sync happens in background
            break;
          case 5:
            systemInitialized = true;
            break;
        }
      }
    } catch (error) {
      console.error('System initialization failed:', error);
      currentStep = 'Initialization failed - using fallback mode';
      systemInitialized = true; // Allow demo to continue
    }
  }

  const architectureInfo = {
    title: "Enhanced Legal AI Architecture",
    components: [
      {
        name: "XState v5 State Machines",
        description: "Manages complex evidence processing workflows with parallel execution, error handling, and retry logic",
        features: [
          "Evidence processing pipeline",
          "Real-time streaming updates",
          "Automatic retry mechanisms",
          "System health monitoring"
        ]
      },
      {
        name: "Enhanced Loki.js Cache",
        description: "High-performance in-memory database with TTL, indexing, and real-time sync",
        features: [
          "Vector embeddings cache",
          "AI analysis results",
          "Graph relationships",
          "Background sync to backend"
        ]
      },
      {
        name: "Multi-Model AI Pipeline",
        description: "Parallel processing with local LLMs (Ollama) and cloud models",
        features: [
          "Text embeddings (nomic-embed-text)",
          "AI tagging (gemma3-legal)",
          "Deep analysis (comprehensive)",
          "Vector similarity search"
        ]
      },
      {
        name: "Graph Database Integration",
        description: "Neo4j for complex relationship discovery and traversal",
        features: [
          "Entity relationship mapping",
          "Multi-hop traversal",
          "Strength-based connections",
          "Real-time updates"
        ]
      },
      {
        name: "Real-time WebSocket System",
        description: "Live updates, streaming results, and system monitoring",
        features: [
          "Processing status updates",
          "AI result streaming",
          "System health monitoring",
          "Cache performance metrics"
        ]
      }
    ]
  };

  const implementationGuide = {
    title: "Implementation Guide",
    sections: [
      {
        title: "1. Setup & Installation",
        steps: [
          "Dependencies are already installed in your package.json",
          "Enhanced state machines are in /src/lib/stores/enhancedStateMachines.ts",
          "Enhanced Loki store is in /src/lib/stores/enhancedLokiStore.ts",
          "API endpoints are in /src/routes/api/ai/process-enhanced/",
          "WebSocket handler is in /src/routes/api/websocket/"
        ]
      },
      {
        title: "2. Integration Steps",
        steps: [
          "Import enhanced stores in your components",
          "Initialize the system with initializeEnhancedMachines()",
          "Use the state machine to process evidence",
          "Subscribe to real-time updates via WebSocket",
          "Access cached results via enhanced Loki API"
        ]
      },
      {
        title: "3. Usage Examples",
        steps: [
          "Add evidence: machine.send({ type: 'ADD_EVIDENCE', evidence })",
          "Get cache stats: enhancedLoki.getStats()",
          "Search similar: enhancedLoki.vector.getMatches(queryHash)",
          "Find relationships: enhancedLoki.graph.getRelationships(nodeId)",
          "Monitor health: machine.send({ type: 'HEALTH_CHECK' })"
        ]
      },
      {
        title: "4. Advanced Features",
        steps: [
          "Custom AI model selection in processing options",
          "Vector similarity threshold tuning",
          "Graph traversal depth configuration",
          "Cache TTL and sync interval adjustment",
          "WebSocket subscription filtering"
        ]
      }
    ]
  };
</script>

<div class="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
  
  <!-- Header Section -->
  <div class="bg-white shadow-sm border-b">
    <div class="max-w-7xl mx-auto px-6 py-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Enhanced Legal AI System
          </h1>
          <p class="text-xl text-gray-600 mt-2">
            Real-time AI-driven data processing with XState + Loki.js
          </p>
          <div class="flex items-center space-x-4 mt-4">
            <Badge class="bg-green-500 text-white">
              XState v5
            </Badge>
            <Badge class="bg-blue-500 text-white">
              Loki.js Enhanced
            </Badge>
            <Badge class="bg-purple-500 text-white">
              WebSocket Streaming
            </Badge>
            <Badge class="bg-orange-500 text-white">
              Multi-Model AI
            </Badge>
          </div>
        </div>
        
        <div class="flex space-x-3">
          <Button 
            variant="outline" 
            on:click={() => showArchitectureDocs = !showArchitectureDocs}
          >
            Architecture Docs
          </Button>
          <Button 
            variant="outline"
            on:click={() => showImplementationGuide = !showImplementationGuide}
          >
            Implementation Guide
          </Button>
        </div>
      </div>
    </div>
  </div>

  <!-- Initialization Progress -->
  {#if !systemInitialized}
    <div class="max-w-4xl mx-auto px-6 py-12">
      <Card class="bg-white shadow-lg">
        <CardHeader>
          <CardTitle class="text-center">Initializing Enhanced Legal AI System</CardTitle>
        </CardHeader>
        <CardContent class="space-y-6">
          <!-- Progress Bar -->
          <div class="w-full bg-gray-200 rounded-full h-3">
            <div 
              class="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-500 ease-out"
              style="width: {initializationProgress}%"
            ></div>
          </div>
          
          <!-- Current Step -->
          <div class="text-center">
            <p class="text-lg font-medium text-gray-800">{currentStep}</p>
            <p class="text-sm text-gray-500 mt-1">{initializationProgress.toFixed(0)}% complete</p>
          </div>
          
          <!-- System Components -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-8">
            {#each ['Loki.js', 'XState', 'WebSocket', 'AI Models', 'Cache', 'Ready'] as component, i}
              <div class="text-center p-3 rounded-lg {initializationProgress > (i / 6) * 100 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}">
                <div class="w-3 h-3 rounded-full mx-auto mb-2 {initializationProgress > (i / 6) * 100 ? 'bg-green-500' : 'bg-gray-300'}"></div>
                <p class="text-sm font-medium">{component}</p>
              </div>
            {/each}
          </div>
        </CardContent>
      </Card>
    </div>
  {/if}

  <!-- Architecture Documentation -->
  {#if showArchitectureDocs && systemInitialized}
    <div class="max-w-7xl mx-auto px-6 py-8">
      <Card class="bg-white shadow-lg">
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle>{architectureInfo.title}</CardTitle>
            <Button variant="ghost" on:click={() => showArchitectureDocs = false}>
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each architectureInfo.components as component}
              <div class="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <h3 class="font-bold text-lg mb-2 text-indigo-700">{component.name}</h3>
                <p class="text-gray-600 text-sm mb-3">{component.description}</p>
                <ul class="space-y-1">
                  {#each component.features as feature}
                    <li class="text-sm text-gray-700 flex items-center">
                      <span class="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                      {feature}
                    </li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        </CardContent>
      </Card>
    </div>
  {/if}

  <!-- Implementation Guide -->
  {#if showImplementationGuide && systemInitialized}
    <div class="max-w-7xl mx-auto px-6 py-8">
      <Card class="bg-white shadow-lg">
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle>{implementationGuide.title}</CardTitle>
            <Button variant="ghost" on:click={() => showImplementationGuide = false}>
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            {#each implementationGuide.sections as section}
              <div class="border rounded-lg p-4">
                <h3 class="font-bold text-lg mb-3 text-purple-700">{section.title}</h3>
                <ol class="space-y-2">
                  {#each section.steps as step, i}
                    <li class="text-sm text-gray-700 flex">
                      <span class="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-700 rounded-full text-xs flex items-center justify-center mr-3 mt-0.5">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  {/each}
                </ol>
              </div>
            {/each}
          </div>
        </CardContent>
      </Card>
    </div>
  {/if}

  <!-- Main Demo Component -->
  {#if systemInitialized}
    <div class="px-6 pb-8">
      <EnhancedLegalAIDemo />
    </div>
  {/if}

  <!-- Footer -->
  <div class="bg-gray-50 border-t">
    <div class="max-w-7xl mx-auto px-6 py-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 class="font-bold text-lg mb-3">Technology Stack</h3>
          <ul class="space-y-1 text-sm text-gray-600">
            <li>• SvelteKit 2 + TypeScript</li>
            <li>• XState v5 State Machines</li>
            <li>• Loki.js In-Memory Database</li>
            <li>• PostgreSQL + Drizzle ORM</li>
            <li>• Redis Caching Layer</li>
            <li>• Neo4j Graph Database</li>
            <li>• Ollama Local LLMs</li>
            <li>• WebSocket Real-time Updates</li>
          </ul>
        </div>
        
        <div>
          <h3 class="font-bold text-lg mb-3">AI Models</h3>
          <ul class="space-y-1 text-sm text-gray-600">
            <li>• nomic-embed-text (Embeddings)</li>
            <li>• gemma3-legal (Analysis)</li>
            <li>• Custom legal prompts</li>
            <li>• Vector similarity search</li>
            <li>• Graph relationship discovery</li>
          </ul>
        </div>
        
        <div>
          <h3 class="font-bold text-lg mb-3">Features</h3>
          <ul class="space-y-1 text-sm text-gray-600">
            <li>• Real-time evidence processing</li>
            <li>• Multi-stage AI pipeline</li>
            <li>• Vector similarity matching</li>
            <li>• Graph relationship mapping</li>
            <li>• Intelligent caching</li>
            <li>• System health monitoring</li>
            <li>• Performance optimization</li>
          </ul>
        </div>
      </div>
      
      <div class="border-t pt-6 mt-6 text-center">
        <p class="text-gray-500 text-sm">
          Enhanced Legal AI System - Built with modern web technologies for high-performance legal document processing
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  /* Custom animations */
  @keyframes shimmer {
    0% { background-position: -1000px 0; }
    100% { background-position: 1000px 0; }
  }
  
  .shimmer {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 1000px 100%;
    animation: shimmer 2s infinite;
  }
  
  /* Smooth transitions */
  .transition-all {
    transition: all 0.3s ease-in-out;
  }
  
  /* Custom gradient text */
  .gradient-text {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
</style>