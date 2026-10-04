/**
 * Runs an agent through /api/ai-tools/agent-builder/stream and returns its final result, reporting
 * every progress event on the way. For long runs (the Summary Notes Consolidator takes minutes): the
 * stream keeps the connection alive, where the plain endpoint would wait silently.
 *
 * `reader` is any NDJSON body reader ({ read() → { value, done } }); `fetchImpl` is injectable for tests.
 */
export async function readAgentStream(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let failure = "";
  const handle = (line) => {
    if (!line.trim()) return;
    let event = null;
    try { event = JSON.parse(line); } catch { return; }
    if (event.step === "done") result = event.result || null;
    if (event.step === "error") failure = event.error || "Agent generation failed";
    onEvent?.(event);
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(handle);
  }
  handle(buffer);
  if (failure) throw new Error(failure);
  if (!result) throw new Error("The generation ended without a result.");
  return result;
}

/** POSTs a run config to the streaming endpoint and resolves with the final result. */
export async function runAgentStreaming(config, onEvent, fetchImpl = fetch) {
  const response = await fetchImpl("/api/ai-tools/agent-builder/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config })
  });
  if (!response.ok || !response.body) throw new Error(`Agent generation failed (${response.status})`);
  return readAgentStream(response.body, onEvent);
}
