import { NextResponse } from "next/server";
import { resolveAgentModel } from "../../../../../modules/ai-tools/pipeline/agentBuilder.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    understood: { type: "string", description: "One sentence, in the user's language, saying exactly what Luna will change and where (name the question, section or field), and what stays as it is. Shown to the user." },
    scope: { type: "string", enum: ["whole_result", "specific_items", "one_field_everywhere", "add_content", "other"], description: "whole_result: a general change to everything. specific_items: only named parts (question 3, the second section). one_field_everywhere: one kind of field in every item (the answers, the explanations, the options). add_content: new parts are added." },
    targets: { type: "array", description: "For specific_items: each part to change, by its reference in the outline, with the exact change (keep the user's own wording for replacements). Empty otherwise.", items: { type: "object", additionalProperties: false, properties: { ref: { type: "string", description: "e.g. 'Question 3 [7]'" }, change: { type: "string" } }, required: ["ref", "change"] } },
    fields: { type: "array", items: { type: "string" }, description: "Names of the output fields the change touches, taken from outputFields. Empty when it concerns all of them." },
    brief: { type: "string", description: "The precise instruction for the writer: what to change, where, how much, and how it should look in the result. Concrete, no vagueness." },
    checklist: { type: "array", items: { type: "string" }, description: "3–6 verifiable conditions the new result must satisfy so the change is clearly visible (counts, places, what must appear)." },
    relax: { type: "array", items: { type: "string" }, description: "Constraints of the original instructions that the request overrides (for example: length limits, item counts). Empty if none." },
    keep: { type: "array", items: { type: "string" }, description: "What must stay exactly as it is." }
  },
  required: ["understood", "scope", "targets", "fields", "brief", "checklist", "relax", "keep"]
};

const SYSTEM = `Turn the user's short change request into a precise revision brief that a writer cannot misread. The person generated a study document with an AI agent, read it, and asks for a change in a few words; a brief that names the place, the amount and the check is what makes the change visible.

The user message is a JSON object with these keys:
- agent: the agent's name and its originalInstructions.
- userChoices: what the person chose when they ran the agent (language, count, difficulty...).
- outputFields: the names of the fields in the result.
- resultOutline: the current result as a NUMBERED OUTLINE, with [n] before each part; questions are also numbered "Question k" in reading order.
- earlierRequests: changes already applied to this result; use them only to understand references such as "like before".
- request: the change the person asks for now.

Work through these steps, then fill the fields in the order of the schema:
1. LOCATE. Decide which part of this result the request is about. "Question 3", "the last one", "the second section", "the options", "the answers", "the explanations" are tied to real parts of the outline or to fields in outputFields (outputFields tells which field holds the answers, explanations, options, hints...). When the request gives exact new content ("change question 3 to ask about X"), copy the person's own wording into targets[].change, because it is their content.
2. SCOPE. Choose one: whole_result (a general change with no place named, such as "more detail", "simpler language", "shorter"; it applies to every text part), specific_items (only the named parts change), one_field_everywhere (one kind of field in every item: "more detail in the answers" changes the answer or explanation field of every question and nothing else), add_content (new parts are added: "add 3 more questions", "add a summary at the end").
3. BE CONCRETE. "More detail" becomes how much more and of what kind (a further sentence of reasoning, the formula, a worked step); "add examples" says how many and where. Measurable wording lets the writer and the checklist agree on what done looks like.
4. AMBIGUITY. Resolve it yourself: choose the most natural reading for this result and state it in "understood". Where two readings are both plausible and harmless, satisfy both.
5. CONFLICTS. When the request conflicts with the agent's original instructions (page or item limits, brevity), the request wins. List those constraints under relax and leave them out of the checklist, because the checklist states what the new result must do.
6. KEEP. For specific_items and one_field_everywhere, keep says that every other part or field stays word for word and in the same order. Leave out of keep anything the change necessarily alters (a harder question needs new options and a new explanation; a shorter text drops sentences), because freezing it would make the change impossible.
7. VERIFIABLE. Each checklist item can be checked by reading the new result.
8. BASE. The content stays grounded in the reference material, so ask only for what the material supports.

Language: write "understood" in the language of the person's request and make it name the exact place ("I'll rewrite question 3 to ask about X and leave the other 9 as they are"); write brief and checklist in the language of the result. Use plain words about the document (question, section, answer) and leave out prompts, JSON and models, because the person reads "understood".

Before answering, check that every target ref exists in the outline, that scope matches the targets and fields you listed, and that nothing in keep contradicts the request.`;

/**
 * The prompt improver for "Iterate". People ask for a twist in a few words ("more examples");
 * left as it is, the model changes little and the agent's original limits ("one page") win. This
 * turns the request into a precise revision brief with a checklist the new result must meet, and
 * names the original constraints the request overrides.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const text = String(body?.request || "").trim();
    if (!text) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    const fallback = { understood: text, scope: "other", targets: [], fields: [], brief: text, checklist: [], relax: [], keep: [] };
    if (!apiKey) return NextResponse.json({ ...fallback, improved: false });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: resolveAgentModel(process.env.LUNA_REFINER_MODEL),
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: "iteration_brief", strict: true, schema: SCHEMA } },
        messages: [
          {
            role: "system",
            content: SYSTEM
          },
          {
            role: "user",
            content: JSON.stringify({
              agent: { name: String(body?.agentName || ""), originalInstructions: String(body?.instructions || "").slice(0, 2500) },
              userChoices: Array.isArray(body?.choices) ? body.choices : [],
              outputFields: Array.isArray(body?.fields) ? body.fields.slice(0, 40) : [],
              resultOutline: String(body?.outline || body?.currentResult || "").slice(0, 10000),
              earlierRequests: Array.isArray(body?.earlier) ? body.earlier.slice(-4) : [],
              request: text
            })
          }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Could not improve the request");
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    return NextResponse.json({ ...fallback, ...parsed, improved: true });
  } catch (error) {
    // The iteration still works with the user's own words.
    return NextResponse.json({ understood: "", brief: "", checklist: [], relax: [], keep: [], improved: false, error: String(error.message || error) });
  }
}
