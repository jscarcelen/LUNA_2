import { runAgentGeneration } from "../../../../../modules/ai-tools/pipeline/agentBuilder.js";
import { normalizeConfig } from "../../../../../modules/ai-tools/pipeline/agentConfig.js";

// Streams generation progress as newline-delimited JSON. Node runtime is required (Supabase +
// chunking); streaming keeps the connection alive on Vercel so long generations don't hit the
// function idle timeout, and maxDuration raises the hard ceiling for the largest documents.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const config = normalizeConfig(body?.config || {});
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify({ ...event, t: Date.now() - startedAt })}\n`));
      };
      let lastTokenFlush = 0;
      try {
        const result = await runAgentGeneration(config, {
          onProgress: (event) => {
            // Token events arrive many times per second; throttle so the client repaints ~12fps.
            if (event.step === "generate" && event.status === "token") {
              const now = Date.now();
              if (now - lastTokenFlush < 80) return;
              lastTokenFlush = now;
              send({ step: "generate", status: "token", chars: event.chars, delta: event.delta });
              return;
            }
            if (event.step === "done") return;
            send(event);
          }
        });
        send({ step: "done", status: "end", result });
      } catch (error) {
        send({ step: "error", status: "end", error: String(error.message || error) });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no"
    }
  });
}
