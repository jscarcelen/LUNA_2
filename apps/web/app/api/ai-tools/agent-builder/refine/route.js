import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hidden metaprompt agent. Rewrites the creator's wording into a precise brief for the generating
 * model — same intent, ambiguities resolved from the inputs/outputs, missing rules added, empty
 * field descriptions completed. The creator never sees prompts; they see better results.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const spec = body?.spec;
    if (!spec) return NextResponse.json({ error: "spec is required" }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ refined: null, reason: "no model configured" });
    const fields = [];
    const walk = (list, scope) => list.forEach((f) => { fields.push({ id: f.id, name: f.name, type: f.type, scope, description: f.description || "", fromUser: Boolean(f.fromInputId), options: f.options || [] }); if (f.children) walk(f.children, f.type === "array" ? `each ${f.name}` : scope); });
    walk(spec.outputSchema || [], "document");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LUNA_REFINER_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: "refined_brief", strict: true, schema: {
          type: "object", additionalProperties: false,
          properties: {
            core: { type: "string", description: "The rewritten instructions: precise, complete, same intent, 60-200 words, imperative voice, no formatting/styling instructions." },
            style: { type: "string", description: "One sentence on tone/level/language handling, or empty." },
            constraints: { type: "array", items: { type: "string" }, description: "Short rules the creator implied but did not state (distinct items, respect the requested count, use the material, language of the answer, difficulty…). Max 6." },
            fieldDescriptions: { type: "array", items: { type: "object", additionalProperties: false, properties: { fieldId: { type: "string" }, description: { type: "string" } }, required: ["fieldId", "description"] }, description: "Descriptions for fields whose description is empty: what exactly goes in, length, form." },
            notes: { type: "string", description: "One line for the creator, plain words, no jargon: what was clarified." }
          },
          required: ["core", "style", "constraints", "fieldDescriptions", "notes"]
        } } },
        messages: [
          { role: "system", content: "You are a metaprompt engineer for an education platform. You receive an agent recipe written by a teacher or parent in their own words and return a refined brief for the generating model. Keep the creator's intent and language; resolve ambiguity using the inputs (what users choose) and the output structure (what must be produced); add the rules an expert would take for granted; never invent new outputs or inputs; never mention JSON, prompts or models in the brief. Write for a strong model: direct, unambiguous, concise." },
          { role: "user", content: JSON.stringify({ name: spec.name, purpose: spec.purpose, instructions: spec.instructions, inputs: (spec.inputs || []).map((i) => ({ name: i.name, type: i.type, options: i.options || [], description: i.description || "", required: i.required })), material: (spec.contextSlots || []).map((c) => ({ name: c.name, kind: c.kind, usage: c.usage, description: c.description })), outputs: fields, examples: (spec.examples || []).slice(0, 1) }) }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Refine request failed");
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    const fieldDescriptions = Object.fromEntries((parsed.fieldDescriptions || []).filter((item) => item.fieldId && item.description).map((item) => [item.fieldId, item.description]));
    return NextResponse.json({ refined: { core: String(parsed.core || ""), style: String(parsed.style || ""), constraints: (parsed.constraints || []).slice(0, 6), fieldDescriptions, notes: String(parsed.notes || "") } });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
