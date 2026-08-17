import type { RequestHandler } from './$types';
import { listWorkflowEventsAfter } from '$lib/server/atlas/workflow-store';

const encoder = new TextEncoder();

function parseSequence(value: string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export const GET: RequestHandler = ({ locals, params, request, url }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const workflowId = params.workflowId;
  let cursor = Math.max(
    parseSequence(url.searchParams.get('after')),
    parseSequence(request.headers.get('last-event-id'))
  );

  let poll: ReturnType<typeof setInterval> | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let pumping = false;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (poll) clearInterval(poll);
        if (keepalive) clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      };

      const pump = async () => {
        if (pumping || closed) return;
        pumping = true;
        try {
          const events = await listWorkflowEventsAfter(workflowId, cursor, 250);
          for (const event of events) {
            if (closed) break;
            controller.enqueue(
              encoder.encode(
                `id: ${event.sequence}\nevent: workflow-action\ndata: ${JSON.stringify(event)}\n\n`
              )
            );
            cursor = event.sequence;
          }
        } catch (error) {
          if (!closed) {
            controller.enqueue(
              encoder.encode(
                `event: stream-error\ndata: ${JSON.stringify({
                  message: error instanceof Error ? error.message : 'Workflow event stream failed'
                })}\n\n`
              )
            );
          }
        } finally {
          pumping = false;
        }
      };

      controller.enqueue(encoder.encode('retry: 2000\n\n'));
      void pump();
      poll = setInterval(() => void pump(), 900);
      keepalive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 15_000);

      request.signal.addEventListener('abort', close, { once: true });
    },

    cancel() {
      closed = true;
      if (poll) clearInterval(poll);
      if (keepalive) clearInterval(keepalive);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    }
  });
};
