import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Turns natural-language feedback into patches to the agent SPEC (never to the sample output).
 * The model may only edit instructions, constraints and field descriptions.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const spec = body?.spec;
    const feedback = String(body?.feedback || "").trim();
    if (!spec || !feedback) return NextResponse.json({ error: "spec and feedback are required" }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Offline fallback: record the feedback as a constraint.
      return NextResponse.json({ patches: [{ target: "instructions.constraints", value: feedback }], reasoning: "No model configured; added as a rule." });
    }
    const fields = [];
    const walk = (list) => list.forEach((f) => { fields.push({ id: f.id, name: f.name, description: f.description || "" }); if (f.children) walk(f.children); });
    walk(spec.outputSchema || []);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LUNA_AGENT_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: "spec_patches", strict: true, schema: {
          type: "object", additionalProperties: false,
          properties: {
            reasoning: { type: "string" },
            patches: { type: "array", items: { type: "object", additionalProperties: false, properties: {
              target: { type: "string", enum: ["instructions.core", "instructions.style", "instructions.constraints", "field.description"] },
              fieldId: { type: "string" },
              value: { type: "string" }
            }, required: ["target", "fieldId", "value"] } }
          },
          required: ["reasoning", "patches"]
        } } },
        messages: [
          { role: "system", content: "You improve the SPECIFICATION of a content-generating agent based on a creator's feedback about a test run. Return minimal patches: rewrite instructions.core only when the intent changes; prefer adding a constraint or refining a field description. fieldId must be one of the given field ids when target is field.description, otherwise an empty string. Never mention prompts or JSON to the user." },
          { role: "user", content: JSON.stringify({ agent: { name: spec.name, purpose: spec.purpose, instructions: spec.instructions, fields }, lastRun: body?.lastRun || null, feedback }) }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Improve request failed");
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    return NextResponse.json({ patches: Array.isArray(parsed.patches) ? parsed.patches : [], reasoning: parsed.reasoning || "" });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
