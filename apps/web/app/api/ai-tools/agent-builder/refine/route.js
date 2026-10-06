import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFINE_SYSTEM = `Rewrite the agent recipe you receive into a precise brief for the model that will generate the content. Keep the creator's intent and language: the brief says what they meant, only clearer.

The user message is a JSON recipe written by a teacher or parent in their own words, with these keys:
- name, purpose, instructions: what the agent is for and how the creator described it.
- inputs: what the person running the agent chooses each time (language, number of items, difficulty...).
- material: the documents the agent reads when it runs.
- outputs: the fields the agent must produce, each with an id and a description (often empty).
- examples: at most one sample, for tone and shape only.

How to refine:
1. Read the instructions together with the inputs and outputs, and settle every ambiguity from them. The generating model sees only your brief, so it has to be complete and stand on its own.
2. Add the rules an expert would take for granted and the creator left out, such as distinct items, respecting the requested count, staying faithful to the material, answering in the language the person chose, and matching the difficulty. They go in constraints, because short separate rules are easy to follow and to check.
3. Complete fieldDescriptions only for outputs whose description is empty, using the id from outputs: say what exactly goes in the field, how long it is and in what form, so the generating model fills it the same way every time.
4. Stay inside what the creator defined. The brief refers only to the inputs and outputs that exist, because an invented one cannot be filled in at run time.
5. Write the brief as plain instructions about the study content, in the creator's language. Leave out JSON, prompts and models, because the creator never sees them and the brief is read as a teacher's own recipe.
6. Leave presentation (fonts, colours, layout) to the templates, because they decide how the result looks.

Output format: one JSON object with core (the rewritten instructions: precise, complete, same intent, 60-200 words, imperative voice), style (one sentence on tone, level and language handling, or an empty string), constraints (at most 6 short rules), fieldDescriptions (as in step 3) and notes (one plain line for the creator saying what was clarified).

Before answering, check that core keeps the original intent, adds no new input or output, and that every fieldId exists in outputs.`;

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
        model: process.env.LUNA_REFINER_MODEL || "gpt-4o",
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
          { role: "system", content: REFINE_SYSTEM },
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
