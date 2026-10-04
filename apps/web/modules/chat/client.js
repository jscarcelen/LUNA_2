/**
 * Talks to /api/chat from the browser: sends the conversation and hands every NDJSON event
 * (estimate, confirm, status, delta, sources, actions, usage, error, done) to `onEvent` as it arrives.
 * The full-page Assistant and the "Ask Luna" panel next to a piece of material both use it.
 */
export async function streamChat({ messages, scope = {}, referencedDocumentIds = [], context = "", confirmed = false, signal, onEvent }) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ messages, scope, referencedDocumentIds, context, confirmed })
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      onEvent(event);
    }
  }
}
