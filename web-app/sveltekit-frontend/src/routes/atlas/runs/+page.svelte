<script lang="ts">
  let { data, form } = $props();

  const agentName = (id: string) => data.agents.find((agent) => agent.id === id)?.name ?? id;
  const taskName = (id: string | null) =>
    id ? data.tasks.find((task) => task.id === id)?.intent ?? id : 'unscoped';

  const active = (status: string) => ['QUEUED', 'RUNNING', 'WAITING'].includes(status);
</script>

<svelte:head>
  <title>Parent Atlas · Agent Runs</title>
</svelte:head>

<div class="mx-auto flex max-w-7xl flex-col gap-6 p-6">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Parent Atlas control plane</p>
      <h1 class="text-3xl font-semibold">Agent runs & wakeups</h1>
      <p class="mt-2 max-w-3xl text-sm text-slate-600">
        Tasks express intent. Runs are concrete execution attempts. Wakeups are explicit, auditable requests to resume work.
      </p>
    </div>
    <a class="rounded border px-3 py-2 text-sm" href="/atlas">Back to Atlas</a>
  </header>

  <section class="grid gap-3 sm:grid-cols-4">
    <div class="rounded-lg border p-4"><div class="text-xs uppercase text-slate-500">Runs</div><div class="text-2xl font-semibold">{data.runs.length}</div></div>
    <div class="rounded-lg border p-4"><div class="text-xs uppercase text-slate-500">Active</div><div class="text-2xl font-semibold">{data.runs.filter((run) => active(run.status)).length}</div></div>
    <div class="rounded-lg border p-4"><div class="text-xs uppercase text-slate-500">Failed</div><div class="text-2xl font-semibold">{data.runs.filter((run) => run.status === 'FAILED').length}</div></div>
    <div class="rounded-lg border p-4"><div class="text-xs uppercase text-slate-500">Pending wakeups</div><div class="text-2xl font-semibold">{data.wakeups.filter((item) => item.status === 'pending').length}</div></div>
  </section>

  <section class="rounded-lg border p-5">
    <h2 class="text-lg font-semibold">Request agent wakeup</h2>
    <p class="mb-4 text-sm text-slate-600">This creates an idempotent control-plane request; it does not bypass the runtime dispatcher or permissions.</p>
    {#if form?.wakeupError}<p class="mb-3 text-sm text-red-700">{form.wakeupError}</p>{/if}
    {#if form?.wakeupCreated}<p class="mb-3 text-sm text-green-700">Wakeup request recorded.</p>{/if}
    <form method="POST" action="?/requestWakeup" class="grid gap-3 md:grid-cols-4">
      <label class="grid gap-1 text-sm">
        Agent
        <select class="rounded border px-3 py-2" name="agentId" required>
          <option value="">Choose agent</option>
          {#each data.agents as agent}
            <option value={agent.id}>{agent.name} · {agent.protocol}</option>
          {/each}
        </select>
      </label>
      <label class="grid gap-1 text-sm">
        Task (optional)
        <select class="rounded border px-3 py-2" name="taskId">
          <option value="">Unscoped</option>
          {#each data.tasks as task}
            <option value={task.id}>{task.intent}</option>
          {/each}
        </select>
      </label>
      <label class="grid gap-1 text-sm md:col-span-2">
        Reason
        <div class="flex gap-2">
          <input class="min-w-0 flex-1 rounded border px-3 py-2" name="reason" placeholder="verification failed; resume with evidence" required />
          <button class="rounded bg-slate-900 px-4 py-2 text-white" type="submit">Queue wakeup</button>
        </div>
      </label>
    </form>
  </section>

  <section class="overflow-hidden rounded-lg border">
    <div class="border-b px-5 py-4"><h2 class="font-semibold">Recent execution attempts</h2></div>
    <div class="overflow-x-auto">
      <table class="w-full min-w-[1000px] text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th class="p-3">Status</th><th class="p-3">Agent</th><th class="p-3">Task</th><th class="p-3">Protocol</th><th class="p-3">Liveness</th><th class="p-3">Next action</th><th class="p-3">Revision</th><th class="p-3">Evidence</th></tr>
        </thead>
        <tbody>
          {#each data.runs as run}
            <tr class="border-t align-top">
              <td class="p-3 font-medium">{run.status}</td>
              <td class="p-3">{agentName(run.agentId)}</td>
              <td class="max-w-xs p-3">{taskName(run.taskId)}</td>
              <td class="p-3">{run.protocol}/{run.adapterType}</td>
              <td class="p-3">{run.livenessState}{run.livenessReason ? ` · ${run.livenessReason}` : ''}</td>
              <td class="max-w-xs p-3">{run.nextAction ?? '—'}</td>
              <td class="p-3 font-mono text-xs">{run.workspaceRevision ?? '—'}</td>
              <td class="p-3 text-xs">
                {#if run.logRef}<div>log: {run.logRef}</div>{/if}
                {#if run.logSha256}<div class="font-mono">sha: {run.logSha256.slice(0, 12)}…</div>{/if}
                {#if run.errorCode}<div class="text-red-700">{run.errorCode}: {run.errorReason}</div>{/if}
              </td>
            </tr>
          {:else}
            <tr><td class="p-5 text-slate-500" colspan="8">No durable agent runs recorded yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="overflow-hidden rounded-lg border">
    <div class="border-b px-5 py-4"><h2 class="font-semibold">Wakeup queue</h2></div>
    <div class="divide-y">
      {#each data.wakeups as wakeup}
        <div class="grid gap-1 px-5 py-3 text-sm md:grid-cols-[120px_180px_1fr_160px]">
          <span class="font-medium">{wakeup.status}</span>
          <span>{agentName(wakeup.agentId)}</span>
          <span>{wakeup.reason}</span>
          <span class="text-xs text-slate-500">{new Date(wakeup.createdAt).toLocaleString()}</span>
        </div>
      {:else}
        <p class="p-5 text-sm text-slate-500">No wakeup requests.</p>
      {/each}
    </div>
  </section>
</div>
