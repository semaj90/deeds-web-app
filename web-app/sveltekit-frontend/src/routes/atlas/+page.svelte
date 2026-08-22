<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const terminalStatuses = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

  function when(value: Date | string | null | undefined): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  function short(value: string | null | undefined, length = 12): string {
    if (!value) return '—';
    return value.length <= length ? value : `${value.slice(0, length)}…`;
  }

  function statusTone(status: string): string {
    if (['SUCCEEDED', 'PASS', 'healthy', 'approved', 'idle'].includes(status)) return 'ok';
    if (['FAILED', 'FAIL', 'unavailable', 'rejected', 'escalated'].includes(status)) return 'bad';
    if (['AWAITING_APPROVAL', 'VERIFYING', 'BLOCKED', 'degraded', 'pending'].includes(status)) return 'warn';
    return 'neutral';
  }

  const runningCount = $derived(data.tasks.filter((task) => ['CLAIMED', 'RUNNING', 'VERIFYING'].includes(task.status)).length);
  const unhealthyRuntimeCount = $derived(data.runtimeEndpoints.filter((runtime) => runtime.status !== 'healthy').length);
  const activeLeaseCount = $derived(data.leases.filter((lease) => lease.status === 'active').length);
</script>

<svelte:head>
  <title>Parent Atlas Control Plane</title>
</svelte:head>

<div class="atlas-shell">
  <header class="hero">
    <div>
      <p class="eyebrow">PARENT ATLAS · AGENTIC OS</p>
      <h1>Declare intent. Agents work. Receipts prove it.</h1>
      <p class="subtle">
        Tasks, approvals, bounded execution, runtime health, error recovery, verification and audit in one SvelteKit control plane.
      </p>
    </div>
    <form method="POST" action="?/reclaimExpiredLeases">
      <button class="secondary" type="submit">Reclaim expired leases</button>
    </form>
  </header>

  <section class="metrics" aria-label="Atlas status summary">
    <article><span>Running work</span><strong>{runningCount}</strong></article>
    <article><span>Needs approval</span><strong>{data.approvals.length}</strong></article>
    <article><span>Active incidents</span><strong>{data.incidents.length}</strong></article>
    <article><span>Active leases</span><strong>{activeLeaseCount}</strong></article>
    <article><span>Runtime attention</span><strong>{unhealthyRuntimeCount}</strong></article>
  </section>

  <div class="grid two">
    <section class="panel">
      <div class="panel-title">
        <div><p class="eyebrow">TASK MANAGER</p><h2>Declare intent</h2></div>
      </div>
      <form method="POST" action="?/createTask" class="stack">
        <label>Intent<input name="intent" required placeholder="Fix failing Atlas retrieval parity test" /></label>
        <label>Description<textarea name="description" rows="3" placeholder="Acceptance criteria, scope, relevant evidence…"></textarea></label>
        <div class="form-row">
          <label>Priority<input name="priority" type="number" min="0" max="100" value="50" /></label>
          <label>Protocol
            <select name="protocol">
              <option value="internal">internal</option>
              <option value="hermes">Hermes</option>
              <option value="a2a">A2A</option>
              <option value="acp">ACP</option>
              <option value="mcp">MCP</option>
            </select>
          </label>
        </div>
        <div class="checks">
          <label><input type="checkbox" name="approvalRequired" checked /> approval gate</label>
          <label><input type="checkbox" name="verificationRequired" checked /> verification receipt</label>
        </div>
        <button type="submit">Create task</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-title"><div><p class="eyebrow">ORG CHART</p><h2>Register agent</h2></div></div>
      <form method="POST" action="?/createAgent" class="stack">
        <div class="form-row"><label>Name<input name="name" required /></label><label>Role<input name="role" value="engineer" /></label></div>
        <div class="form-row"><label>Title<input name="title" placeholder="Error-fixing agent" /></label><label>Protocol
          <select name="protocol"><option>internal</option><option>hermes</option><option>a2a</option><option>acp</option><option>mcp</option></select>
        </label></div>
        <label>Endpoint<input name="endpoint" placeholder="http://127.0.0.1:… or managed runtime handle" /></label>
        <label>Capabilities<input name="capabilities" placeholder="code.patch,test.run,atlas.resolve" /></label>
        <button type="submit">Register agent</button>
      </form>
    </section>
  </div>

  <section class="panel wide">
    <div class="panel-title"><div><p class="eyebrow">WORK QUEUE</p><h2>Tasks</h2></div><span class="machine">{data.tasks.length} loaded</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Status</th><th>Intent</th><th>Protocol</th><th>Agent</th><th>Attempt</th><th>Revision</th><th>Updated</th><th>Control</th></tr></thead>
        <tbody>
          {#each data.tasks as task (task.id)}
            <tr>
              <td><span class:ok={statusTone(task.status) === 'ok'} class:bad={statusTone(task.status) === 'bad'} class:warn={statusTone(task.status) === 'warn'} class="status">{task.status}</span></td>
              <td><strong>{task.intent}</strong>{#if task.errorReason}<div class="error">{task.errorReason}</div>{/if}{#if task.blockedReason}<div class="warn-text">{task.blockedReason}</div>{/if}</td>
              <td class="machine">{task.protocol}</td>
              <td class="machine">{short(task.assignedAgentId)}</td>
              <td class="machine">{task.attemptCount}/{task.maxAttempts}</td>
              <td class="machine">{short(task.workspaceRevision)}</td>
              <td class="machine">{when(task.updatedAt)}</td>
              <td>
                {#if task.status === 'QUEUED' && data.agents.length}
                  <form method="POST" action="?/claimTask" class="inline">
                    <input type="hidden" name="taskId" value={task.id} />
                    <select name="agentId" aria-label="Agent"><option value="">agent…</option>{#each data.agents as agent}<option value={agent.id}>{agent.name}</option>{/each}</select>
                    <button class="small" type="submit">Assign</button>
                  </form>
                {:else if !terminalStatuses.has(task.status)}
                  <form method="POST" action="?/transitionTask" class="inline">
                    <input type="hidden" name="taskId" value={task.id} />
                    <select name="toStatus" aria-label="Next status">
                      <option value="RUNNING">RUNNING</option><option value="VERIFYING">VERIFYING</option><option value="BLOCKED">BLOCKED</option><option value="FAILED">FAILED</option><option value="CANCELLED">CANCELLED</option>
                    </select>
                    <button class="small" type="submit">Apply</button>
                  </form>
                {/if}
              </td>
            </tr>
          {:else}<tr><td colspan="8" class="empty">No Atlas tasks yet. Declare the first intent above.</td></tr>{/each}
        </tbody>
      </table>
    </div>
  </section>

  <div class="grid two">
    <section class="panel">
      <div class="panel-title"><div><p class="eyebrow">HUMAN GATE</p><h2>Approvals</h2></div></div>
      {#each data.approvals as approval (approval.id)}
        <article class="review-card">
          <div><span class="status warn">{approval.type}</span><span class="machine">task {short(approval.taskId)}</span></div>
          <p>Required revision: <span class="machine">{short(approval.requiredRevision, 20)}</span></p>
          <form method="POST" action="?/decideApproval" class="stack compact">
            <input type="hidden" name="approvalId" value={approval.id} />
            <input name="note" placeholder="Decision note / requested correction" />
            <div class="actions"><button name="decision" value="approved">Approve</button><button class="secondary" name="decision" value="revision_requested">Request revision</button><button class="danger" name="decision" value="rejected">Reject</button></div>
          </form>
        </article>
      {:else}<p class="empty">Nothing requires approval.</p>{/each}
    </section>

    <section class="panel">
      <div class="panel-title"><div><p class="eyebrow">ERROR FIXING</p><h2>Active incidents</h2></div></div>
      {#each data.incidents as incident (incident.id)}
        <article class="incident"><div><span class="status bad">{incident.severity}</span><strong>{incident.kind}</strong></div><p>{incident.message}</p><div class="machine">×{incident.occurrenceCount} · {when(incident.lastSeenAt)} · {short(incident.workspaceRevision, 20)}</div></article>
      {:else}<p class="empty">No active error incidents.</p>{/each}
    </section>
  </div>

  <div class="grid two">
    <section class="panel">
      <div class="panel-title"><div><p class="eyebrow">EXECUTION OWNERSHIP</p><h2>Leases & heartbeats</h2></div></div>
      {#each data.leases.slice(0, 12) as lease (lease.id)}
        <div class="line"><span class:ok={lease.status === 'active'} class:warn={lease.status === 'expired'} class="status">{lease.status}</span><span class="machine">task {short(lease.taskId)} · epoch {lease.epoch}</span><span class="machine">expires {when(lease.expiresAt)}</span></div>
      {:else}<p class="empty">No execution leases recorded.</p>{/each}
      <h3>Recent runs</h3>
      {#each data.heartbeatRuns.slice(0, 8) as run (run.id)}<div class="line"><span class="status">{run.status}</span><span class="machine">{run.protocol} · agent {short(run.agentId)}</span><span class="machine">{when(run.startedAt)}</span></div>{/each}
    </section>

    <section class="panel">
      <div class="panel-title"><div><p class="eyebrow">AGENTIC OS</p><h2>Runtime endpoints</h2></div></div>
      {#each data.runtimeEndpoints as runtime (runtime.id)}
        <div class="runtime-row"><div><strong>{runtime.name}</strong><div class="machine">{runtime.protocol} · {runtime.transport} · {short(runtime.endpoint, 32)}</div></div><div><span class:ok={statusTone(runtime.status) === 'ok'} class:bad={statusTone(runtime.status) === 'bad'} class:warn={statusTone(runtime.status) === 'warn'} class="status">{runtime.status}</span><form method="POST" action="?/toggleRuntime" class="inline"><input type="hidden" name="endpointId" value={runtime.id}/><input type="hidden" name="enabled" value={runtime.enabled ? 'false' : 'true'}/><button class="small secondary" type="submit">{runtime.enabled ? 'Disable' : 'Enable'}</button></form></div></div>
      {:else}<p class="empty">No runtime endpoints configured. Hermes/A2A/ACP remain fail-closed until an adapter is registered.</p>{/each}
    </section>
  </div>

  <div class="grid two">
    <section class="panel"><div class="panel-title"><div><p class="eyebrow">TRAINING</p><h2>Skills & evals</h2></div></div>
      {#each data.skills as skill (skill.id)}<div class="line"><span><strong>{skill.name}</strong><span class="machine"> · {skill.revision}</span></span><span class="status">{skill.status}</span></div>{:else}<p class="empty">No agent skills registered.</p>{/each}
      <h3>Recent evals</h3>{#each data.evalRuns.slice(0, 8) as run (run.id)}<div class="line"><span class="machine">{run.suiteRevision}</span><span class="status">{run.status}</span></div>{/each}
    </section>

    <section class="panel"><div class="panel-title"><div><p class="eyebrow">PROOF</p><h2>Verification receipts</h2></div></div>
      {#each data.receipts.slice(0, 12) as receipt (receipt.id)}<div class="line"><span class:ok={receipt.status === 'PASS'} class:bad={receipt.status === 'FAIL'} class="status">{receipt.status}</span><span class="machine">task {short(receipt.taskId)} · {short(receipt.checksum, 18)}</span><span class="machine">{when(receipt.createdAt)}</span></div>{:else}<p class="empty">No verification receipts yet.</p>{/each}
    </section>
  </div>

  <section class="panel wide"><div class="panel-title"><div><p class="eyebrow">IMMUTABLE HISTORY</p><h2>Audit stream</h2></div></div>
    <div class="audit-grid">{#each data.audit.slice(0, 30) as event (event.id)}<div class="audit-event"><span class="machine">{when(event.createdAt)}</span><strong>{event.action}</strong><span>{event.entityType}</span><span class="machine">{short(event.entityId, 20)}</span></div>{:else}<p class="empty">No audit events.</p>{/each}</div>
  </section>
</div>

<style>
  :global(body) { background: var(--atlas-bg, #0b0d10); color: var(--atlas-fg, #e7ebef); }
  .atlas-shell { max-width: 1600px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
  .hero,.panel-title,.runtime-row,.line,.audit-event,.actions,.inline,.checks,.form-row { display:flex; gap:.75rem; align-items:center; }
  .hero,.panel-title,.runtime-row { justify-content:space-between; }
  h1 { max-width: 850px; margin:.25rem 0; font-size:clamp(2rem,4vw,4rem); line-height:1; } h2,h3 { margin:.2rem 0; }
  .eyebrow,.machine { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; } .eyebrow { letter-spacing:.12em; font-size:.72rem; color:#88a1b8; } .machine { font-size:.78rem; color:#9daab6; }
  .subtle,.empty { color:#9daab6; }.metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:.75rem; margin:1.5rem 0; }.metrics article,.panel { background:#12161b; border:1px solid #262d35; border-radius:12px; }.metrics article { padding:1rem; }.metrics span { color:#9daab6; font-size:.8rem; display:block; }.metrics strong { font-size:2rem; }
  .grid { display:grid; gap:1rem; margin:1rem 0; }.grid.two { grid-template-columns:repeat(2,minmax(0,1fr)); }.panel { padding:1rem; min-width:0; }.wide { margin:1rem 0; }.stack { display:grid; gap:.75rem; }.compact { gap:.5rem; } label { display:grid; gap:.35rem; font-size:.8rem; color:#bdc7d0; flex:1; } input,textarea,select,button { font:inherit; } input,textarea,select { width:100%; box-sizing:border-box; background:#0c1014; color:#e7ebef; border:1px solid #303943; border-radius:7px; padding:.6rem; } button { border:0; border-radius:7px; padding:.6rem .9rem; background:#d7e7f6; color:#0b0d10; font-weight:650; cursor:pointer; } button.secondary { background:#26313b; color:#e7ebef; } button.danger { background:#5d2529; color:#fff; } button.small { padding:.4rem .55rem; font-size:.75rem; }.checks label { display:flex; align-items:center; }.checks input { width:auto; }
  .table-wrap { overflow:auto; } table { width:100%; border-collapse:collapse; min-width:1100px; } th,td { text-align:left; vertical-align:top; padding:.7rem; border-bottom:1px solid #252c33; font-size:.82rem; } th { color:#8999a7; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; }.status { display:inline-flex; border-radius:999px; padding:.2rem .45rem; background:#27303a; font-family:ui-monospace,monospace; font-size:.7rem; white-space:nowrap; }.status.ok,.ok { background:#173a2a; color:#a5e6bf; }.status.bad,.bad { background:#492126; color:#ffc4ca; }.status.warn,.warn { background:#493d18; color:#f4df91; }.error { color:#ffadb5; margin-top:.25rem; }.warn-text { color:#f0d77b; margin-top:.25rem; }.review-card,.incident { border-top:1px solid #262d35; padding:.8rem 0; }.review-card:first-of-type,.incident:first-of-type { border-top:0; }.actions { flex-wrap:wrap; }.line { justify-content:space-between; border-top:1px solid #242b32; padding:.55rem 0; }.runtime-row { border-top:1px solid #242b32; padding:.65rem 0; }.runtime-row>div:last-child { display:flex; gap:.5rem; align-items:center; }.audit-grid { display:grid; }.audit-event { display:grid; grid-template-columns:190px 1.5fr 1fr 1fr; padding:.5rem 0; border-top:1px solid #242b32; font-size:.82rem; }
  @media (max-width:900px){.grid.two,.metrics { grid-template-columns:1fr; }.hero { align-items:flex-start; flex-direction:column; }.form-row { flex-direction:column; align-items:stretch; }.atlas-shell { padding:1rem; }.audit-event { grid-template-columns:1fr; gap:.2rem; }}
</style>
