<script lang="ts">
  import { onMount } from 'svelte';
  import { Progress } from 'bits-ui';
  import type { PageData } from './$types';
  import type { WorkflowActionEventV1 } from '$lib/server/atlas/workflow-event';

  let { data, form }: { data: PageData; form: any } = $props();

  let workflowId = $state(data.snapshot?.workflow.id ?? null);
  let revision = $state(data.snapshot?.workflow.revision ?? 0);
  let lastSequence = $state(data.snapshot?.workflow.lastSequence ?? 0);
  let streamState = $state<'idle' | 'connecting' | 'live' | 'reconnecting'>(workflowId ? 'connecting' : 'idle');
  let events = $state<WorkflowActionEventV1[]>([...(data.snapshot?.events ?? [])]);
  let actions = $state<any[]>(data.snapshot?.actions.map((action) => ({ ...action })) ?? []);

  const activeCount = $derived(actions.filter((action) => ['running', 'waiting'].includes(action.state)).length);
  const failedCount = $derived(actions.filter((action) => action.state === 'failed').length);
  const completedCount = $derived(actions.filter((action) => action.state === 'succeeded').length);

  function fraction(progress: unknown, state: string): number {
    if (progress && typeof progress === 'object') {
      const value = (progress as Record<string, unknown>).fraction;
      if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(1, value));
      const completed = (progress as Record<string, unknown>).completedUnits;
      const total = (progress as Record<string, unknown>).totalUnits;
      if (typeof completed === 'number' && typeof total === 'number' && total > 0) {
        return Math.max(0, Math.min(1, completed / total));
      }
    }
    return state === 'succeeded' ? 1 : 0;
  }

  function percent(action: any): number {
    return Math.round(fraction(action.progress, action.state) * 100);
  }

  function applyEvent(event: WorkflowActionEventV1) {
    if (event.workflowId !== workflowId) return;
    if (event.workflowRevision <= revision || event.sequence <= lastSequence) return;

    if (lastSequence > 0 && event.sequence !== lastSequence + 1) {
      streamState = 'reconnecting';
      window.location.reload();
      return;
    }

    revision = event.workflowRevision;
    lastSequence = event.sequence;
    events.push(event);
    if (events.length > 100) events.splice(0, events.length - 100);

    const index = actions.findIndex((action) => action.actionId === event.actionId);
    const projected = {
      workflowId: event.workflowId,
      actionId: event.actionId,
      parentActionId: event.parentActionId ?? null,
      dagNodeId: event.dagNodeId,
      workflowRevision: event.workflowRevision,
      sequence: event.sequence,
      attempt: event.attempt,
      lane: event.lane,
      transport: event.transport ?? null,
      kind: event.kind,
      state: event.state,
      operation: event.operation,
      progress: event.progress ?? {},
      target: event.target ?? {},
      evidenceRefs: event.evidenceRefs ?? [],
      artifactRefs: event.artifactRefs ?? [],
      visual: event.visual ?? null,
      startedAt: event.startedAt ?? null,
      emittedAt: event.emittedAt,
      finishedAt: event.finishedAt ?? null
    };

    if (index === -1) actions.push(projected);
    else actions[index] = projected;
  }

  onMount(() => {
    if (!workflowId) return;
    const source = new EventSource(`/atlas/studio/${workflowId}/events?after=${lastSequence}`);
    source.onopen = () => (streamState = 'live');
    source.onerror = () => (streamState = 'reconnecting');
    source.addEventListener('workflow-action', (message) => {
      applyEvent(JSON.parse((message as MessageEvent<string>).data) as WorkflowActionEventV1);
    });
    return () => source.close();
  });

  function tone(state: string) {
    if (state === 'succeeded') return 'ok';
    if (state === 'failed') return 'bad';
    if (state === 'blocked') return 'warn';
    return 'neutral';
  }
</script>

<svelte:head>
  <title>Parent Atlas Studio</title>
  <meta name="description" content="Parent Atlas workflow integrations, DAG execution and live workflow event administration." />
</svelte:head>

<div class="studio">
  <header class="hero">
    <div>
      <p class="eyebrow">PARENT ATLAS · INTEGRATIONS ADMIN</p>
      <h1>Parent Atlas Studio</h1>
      <p class="lede">One <code>workflow_id</code> lineage from server execution and protocol adapters to SSR, SSE, accessible controls and optional WebGPU scene hints.</p>
    </div>
    <div class="hero-actions">
      <a href="/atlas">Control plane</a>
      <a href="/atlas/runs">Agent runs</a>
    </div>
  </header>

  {#if form?.studioError}<div class="notice bad">{form.studioError}</div>{/if}

  <section class="summary">
    <article><small>WORKFLOWS</small><strong>{data.workflows.length}</strong></article>
    <article><small>ACTIVE ACTIONS</small><strong>{activeCount}</strong></article>
    <article><small>SUCCEEDED</small><strong>{completedCount}</strong></article>
    <article><small>FAILED</small><strong>{failedCount}</strong></article>
    <article><small>SSE</small><strong class:live={streamState === 'live'}>{streamState}</strong></article>
  </section>

  <div class="top-grid">
    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow">WORKFLOW</p><h2>Create / select</h2></div></div>
      <form method="POST" action="?/createWorkflow" class="create">
        <input name="title" required placeholder="Repair retrieval ownership and verify" />
        <button type="submit">Create workflow</button>
      </form>
      <nav class="workflow-list" aria-label="Recent workflows">
        {#each data.workflows as workflow (workflow.id)}
          <a class:active={workflow.id === workflowId} href={`/atlas/studio?workflowId=${workflow.id}`}>
            <span>{workflow.title}</span>
            <small>{workflow.status} · r{workflow.revision} · seq {workflow.lastSequence}</small>
          </a>
        {:else}
          <p class="empty">Create the first Studio workflow.</p>
        {/each}
      </nav>
    </section>

    <section class="panel integrations">
      <div class="panel-head"><div><p class="eyebrow">INTEGRATIONS</p><h2>Execution transports</h2></div><span class="machine">fail-closed</span></div>
      <div class="transport-grid">
        {#each ['local','grpc','rabbitmq','acp','a2a'] as transport}
          {@const endpoints = data.runtimeEndpoints.filter((endpoint) => endpoint.protocol === transport || endpoint.transport === transport)}
          <article>
            <strong>{transport.toUpperCase()}</strong>
            <span>{endpoints.length ? `${endpoints.length} configured endpoint(s)` : 'adapter not proven/configured'}</span>
            <small>{transport === 'grpc' ? 'targeted executor call' : transport === 'rabbitmq' ? 'durable work/event fabric' : 'protocol/transport adapter'}</small>
          </article>
        {/each}
      </div>
    </section>
  </div>

  {#if data.snapshot}
    <section class="workflow-title panel">
      <div>
        <p class="eyebrow">SELECTED WORKFLOW</p>
        <h2>{data.snapshot.workflow.title}</h2>
        <span class="machine">{data.snapshot.workflow.id} · revision {revision} · sequence {lastSequence}</span>
      </div>
      <form method="POST" action="?/emitDemoStep" class="demo-actions">
        <input type="hidden" name="workflowId" value={data.snapshot.workflow.id} />
        <button name="step" value="ast" type="submit">AST</button>
        <button name="step" value="semantic" type="submit">Semantic/gRPC</button>
        <button name="step" value="bitfrost" type="submit">BitFrost/Rabbit</button>
        <button name="step" value="acp" type="submit">ACP</button>
        <button name="step" value="a2a" type="submit">A2A</button>
        <button name="step" value="validate" type="submit">Validate</button>
      </form>
    </section>

    <div class="workspace-grid">
      <section class="panel actions-panel">
        <div class="panel-head"><div><p class="eyebrow">AUTHORITATIVE DOM</p><h2>Action progress</h2></div></div>
        <div class="action-list">
          {#each actions as action (action.actionId)}
            <article class="action-card">
              <div class="action-head">
                <span class={`state ${tone(action.state)}`}>{action.state}</span>
                <div class="action-copy"><strong>{action.operation}</strong><small>{action.lane} · {action.transport ?? 'local'} · node {action.dagNodeId}</small></div>
                <b>{percent(action)}%</b>
              </div>
              <Progress.Root class="progress" value={percent(action)} max={100} aria-label={`${action.operation}: ${percent(action)} percent`}>
                <div class="fill" style:width={`${percent(action)}%`}></div>
              </Progress.Root>
              <div class="refs">
                <span>{action.evidenceRefs?.length ?? 0} evidence</span>
                <span>{action.artifactRefs?.length ?? 0} artifacts</span>
                <span>attempt {action.attempt}</span>
              </div>
            </article>
          {:else}<p class="empty">No action projection yet.</p>{/each}
        </div>
      </section>

      <section class="panel dag-panel">
        <div class="panel-head"><div><p class="eyebrow">DAG PROJECTION</p><h2>Dependencies</h2></div><span class="machine">server truth → UI projection</span></div>
        <div class="dag">
          {#each [...new Set(data.snapshot.dagEdges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]))] as node}
            {@const nodeActions = actions.filter((action) => action.dagNodeId === node)}
            {@const state = nodeActions.at(-1)?.state ?? 'queued'}
            <div class={`dag-node ${tone(state)}`}>
              <strong>{node}</strong>
              <small>{state}</small>
            </div>
          {/each}
        </div>
        <div class="edges">
          {#each data.snapshot.dagEdges as edge}
            <span><code>{edge.fromNodeId}</code> → <code>{edge.toNodeId}</code></span>
          {/each}
        </div>
        <div class="canvas-contract">
          <p class="eyebrow">WEBGPU SCENE CONTRACT</p>
          <p>The canvas receives only optional <code>visual.station</code>, <code>visual.animation</code> and FX hints. Workflow status, retries, evidence, DAG dependencies and database state remain outside the renderer.</p>
          {#if events.at(-1)?.visual}
            <div class="scene-hint"><span>station</span><strong>{events.at(-1)?.visual?.station}</strong><span>animation</span><strong>{events.at(-1)?.visual?.animation}</strong><span>fx</span><strong>{events.at(-1)?.visual?.fx ?? '—'}</strong></div>
          {/if}
        </div>
      </section>

      <section class="panel events-panel">
        <div class="panel-head"><div><p class="eyebrow">APPEND-ONLY HISTORY</p><h2>Live event stream</h2></div><span class:live={streamState === 'live'} class="stream-dot">● {streamState}</span></div>
        <div class="event-list" aria-live="polite">
          {#each events.slice().reverse() as event (event.sequence)}
            <article>
              <div><b>#{event.sequence}</b><span>{event.kind}</span><span>{event.state}</span></div>
              <strong>{event.operation}</strong>
              <small>{event.lane} · {event.transport ?? 'local'} · r{event.workflowRevision}</small>
              <time>{new Date(event.emittedAt).toLocaleTimeString()}</time>
            </article>
          {:else}<p class="empty">No events yet.</p>{/each}
        </div>
      </section>
    </div>
  {:else}
    <section class="panel empty-state"><h2>No workflow selected</h2><p>Create a workflow to initialize the SSR snapshot and live event stream.</p></section>
  {/if}
</div>

<style>
  :global(body){margin:0;background:#070d14;color:#eaf5ff;font-family:Inter,system-ui,sans-serif}:global(*){box-sizing:border-box}:global(:root){--line:#8bcfff20;--panel:#0d1824;--muted:#8399aa;--cyan:#4ae5ff;--green:#65ed83;--red:#ff8d98;--amber:#f2d46c;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .studio{max-width:1680px;margin:auto;padding:24px}.hero{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:18px}.eyebrow{margin:0;color:#7890a3;font:800 .65rem var(--mono);letter-spacing:.12em}.hero h1{font-size:clamp(2.4rem,5vw,5rem);line-height:.95;margin:.3rem 0}.lede{max-width:900px;color:#91a6b7}.hero-actions{display:flex;gap:8px}.hero-actions a,.demo-actions button,button{border:1px solid var(--line);border-radius:9px;background:#142334;color:#eaf5ff;padding:.65rem .8rem;text-decoration:none;font:inherit;cursor:pointer}
  .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px}.summary article,.panel{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,#0e1a27,#0a141e)}.summary article{padding:13px}.summary small{display:block;color:var(--muted);font:.58rem var(--mono)}.summary strong{display:block;margin-top:5px;font-size:1.25rem}.live{color:var(--green)!important}
  .top-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:12px}.panel{min-width:0}.panel-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px;border-bottom:1px solid var(--line)}.panel h2{margin:.2rem 0;font-size:1rem}.machine{font:.65rem var(--mono);color:var(--muted)}.create{display:flex;gap:8px;padding:12px}.create input{min-width:0;flex:1;background:#07111a;color:#eaf5ff;border:1px solid var(--line);border-radius:9px;padding:.7rem}
  .workflow-list{padding:0 10px 10px;display:grid;gap:6px}.workflow-list a{display:grid;gap:3px;padding:10px;border-radius:9px;color:#dcebf6;text-decoration:none;background:#ffffff04}.workflow-list a.active{outline:1px solid #4ae5ff66;background:#4ae5ff0c}.workflow-list small{color:var(--muted);font:.6rem var(--mono)}
  .transport-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:12px}.transport-grid article{padding:11px;border:1px solid var(--line);border-radius:10px;background:#ffffff04}.transport-grid strong,.transport-grid span,.transport-grid small{display:block}.transport-grid strong{color:var(--cyan);font:.72rem var(--mono)}.transport-grid span{margin-top:6px;font-size:.7rem}.transport-grid small{margin-top:4px;color:var(--muted);font-size:.58rem}
  .workflow-title{margin-top:12px;padding:14px;display:flex;justify-content:space-between;gap:14px;align-items:center}.demo-actions{display:flex;gap:6px;flex-wrap:wrap}.demo-actions button{font-size:.65rem;padding:.5rem .6rem}.workspace-grid{display:grid;grid-template-columns:.86fr 1.1fr .72fr;gap:12px;margin-top:12px;min-height:650px}.actions-panel,.dag-panel,.events-panel{overflow:hidden}.action-list,.event-list{padding:10px;display:grid;gap:8px;max-height:650px;overflow:auto}.action-card{padding:11px;border:1px solid var(--line);border-radius:10px;background:#ffffff03}.action-head{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center}.action-copy{min-width:0}.action-copy strong,.action-copy small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.action-copy strong{font-size:.72rem}.action-copy small,.refs{color:var(--muted);font-size:.58rem}.state{border-radius:999px;padding:.24rem .42rem;background:#263544;font:.58rem var(--mono)}.ok{color:#9af1b0!important;border-color:#4cc46c55!important}.bad{color:#ffadb5!important;border-color:#ff6f7c55!important}.warn{color:#f3dc89!important;border-color:#d7ba5155!important}.progress{height:8px;display:block;margin-top:9px;border-radius:99px;overflow:hidden;background:#ffffff0b}.fill{height:100%;background:linear-gradient(90deg,#6557ff,#42e8ff);transition:width .3s ease}.refs{display:flex;gap:10px;margin-top:7px}
  .dag{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:14px}.dag-node{display:grid;gap:3px;padding:14px;border:1px solid var(--line);border-radius:11px;background:#ffffff04}.dag-node strong{font:.72rem var(--mono)}.dag-node small{color:var(--muted)}.edges{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 14px}.edges span{padding:.35rem .5rem;border-radius:8px;background:#07111a;color:#9bb2c4;font-size:.6rem}.canvas-contract{margin:0 14px 14px;padding:13px;border:1px dashed #a35cff55;border-radius:11px;background:#a35cff0b;color:#9eb1c0;font-size:.68rem;line-height:1.55}.scene-hint{display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr;gap:7px;margin-top:10px}.scene-hint span{color:#778da0}.scene-hint strong{color:#d4c2ff}
  .stream-dot{font-size:.62rem;color:var(--muted)}.event-list article{display:grid;grid-template-columns:1fr auto;gap:4px;padding:10px;border-bottom:1px solid var(--line)}.event-list article>div{grid-column:1/-1;display:flex;gap:7px;color:#7890a3;font:.58rem var(--mono)}.event-list article>strong{font-size:.68rem}.event-list article>small{color:var(--muted);font-size:.57rem}.event-list time{grid-row:2/4;grid-column:2;color:#6f8596;font:.56rem var(--mono)}.empty,.empty-state{color:var(--muted)}.empty-state{margin-top:12px;padding:30px}.notice{padding:10px 12px;border-radius:9px;margin-bottom:10px;background:#2e151b}
  @media(max-width:1180px){.top-grid,.workspace-grid{grid-template-columns:1fr}.transport-grid{grid-template-columns:repeat(2,1fr)}.summary{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.studio{padding:12px}.hero,.workflow-title{align-items:flex-start;flex-direction:column}.transport-grid,.summary{grid-template-columns:1fr}.dag{grid-template-columns:1fr}.scene-hint{grid-template-columns:1fr 1fr}}
</style>
