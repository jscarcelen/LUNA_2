/**
 * Reads OpenAI's streamed chat completion: text arrives piece by piece (shown at once), tool calls
 * arrive as fragments that are put back together, and the usage comes last.
 */
export async function readChatStream(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = null;
  let finishReason = "";
  const calls = new Map();

  function handle(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let json;
    try { json = JSON.parse(payload); } catch { return; }
    if (json.usage) usage = json.usage;
    const choice = json.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta || {};
    if (delta.content) { content += delta.content; onDelta?.(delta.content); }
    for (const call of delta.tool_calls || []) {
      const slot = calls.get(call.index) || { id: "", name: "", arguments: "" };
      if (call.id) slot.id = call.id;
      if (call.function?.name) slot.name += call.function.name;
      if (call.function?.arguments) slot.arguments += call.function.arguments;
      calls.set(call.index, slot);
    }
  }

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(handle);
  }
  if (buffer) handle(buffer);
  return { content, usage, finishReason, toolCalls: [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call) };
}
