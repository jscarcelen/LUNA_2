import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPROVE_SYSTEM = `Turn a creator's feedback into the smallest set of patches that fixes the agent's specification. The feedback is about a test run; the patches change the specification (the recipe), never the sample result, so every future run improves.

The user message is a JSON object with these keys:
- agent: name, purpose, instructions (core, style, constraints) and fields (id, name, description of each output field).
- lastRun: the test run the creator looked at, or null.
- feedback: what the creator said in their own words.

How to patch:
1. Find what in the recipe caused what the creator dislikes, using lastRun as evidence. Feedback about one result ("question 3 is wrong") becomes a general rule that prevents it, because the creator is improving the agent, not that one run.
2. Prefer the lightest patch that works: instructions.constraints (one short rule per patch) or field.description (what exactly goes in the field, how long, in what form). Use instructions.style for tone, level or language handling. Rewrite instructions.core only when the agent's intent itself changes, because it carries the creator's own wording.
3. For field.description, set fieldId to one of the ids in agent.fields. For every other target set fieldId to an empty string.
4. Write each value in the language of the agent's instructions, as plain direct wording about the content.
5. Write reasoning first: one or two plain sentences saying what the feedback asks for and why these patches answer it. Keep prompts, JSON and models out of it, because the creator reads it.

Before answering, check that every patch traces back to the feedback and that each fieldId is valid for its target.`;

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
        model: process.env.LUNA_AGENT_MODEL || "gpt-4o",
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
          { role: "system", content: IMPROVE_SYSTEM },
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
