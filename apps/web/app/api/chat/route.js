import { runChat } from "../../../modules/chat/engine.js";
import { createSupabaseAdminClient } from "../../../lib/supabaseClient.js";
import { ownerUserIdForFresh, runAsOwner } from "../../../lib/session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Requests Luna cannot do yet are kept for the Luna team (table `feature_requests`; logged if it does not exist yet). */
async function recordRequest(summary, ownerUserId) {
  try {
    const client = createSupabaseAdminClient();
    const { error } = await client.from("feature_requests").insert({ summary, source: "assistant", owner_user_id: ownerUserId || null });
    if (error) throw error;
  } catch (error) {
    console.warn("[chat] feature request (not stored):", summary, String(error?.message || error));
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ownerUserId = await ownerUserIdForFresh(request);
  const encoder = new TextEncoder();
  const stream = runAsOwner(ownerUserId, () => new ReadableStream({
    async start(controller) {
      const emit = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runChat({ messages: body.messages, scope: body.scope || {}, referencedDocumentIds: body.referencedDocumentIds || [], context: String(body.context || ""), confirmed: Boolean(body.confirmed), emit, recordRequest: (summary) => recordRequest(summary, ownerUserId) });
      } catch (error) {
        emit({ type: "error", error: String(error?.message || error) });
      } finally {
        controller.close();
      }
    }
  }));
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
