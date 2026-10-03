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

const SYSTEM = `You are the prompt improver of an education platform. A person generated a study document with an AI agent, read it, and asks for a change in a few words. Turn that request into a precise revision brief that a writer cannot misread.

You are given the result as a NUMBERED OUTLINE ([n] before each part; questions are also numbered "Question k" in reading order) and the names of its output fields. Work like this:
1. LOCATE. Decide which part of THIS result the request is about. "Question 3", "the last one", "the second section", "the options", "the answers", "the explanations" must be tied to real parts or fields of the outline (use outputFields to tell which field holds the answers, explanations, options, hints…). If the request gives exact new content ("change question 3 to ask about X"), copy the user's wording into targets[].change.
2. SCOPE. Choose one: whole_result (a general change: "more detail", "simpler language", "shorter" with no place named — then it applies to every text part), specific_items (only the named parts change), one_field_everywhere (a kind of field in every item: "more detail in the answers" changes the answer/explanation fields of every question and nothing else), add_content (new parts are added: "add 3 more questions", "add a summary at the end").
3. BE CONCRETE. "More detail" becomes how much more and of what kind (a further sentence of reasoning, the formula, a worked step); "add examples" says how many, where. Measurable, never vague.
4. AMBIGUITY. Never ask a question back. Pick the most natural reading for this result and state it in "understood"; where two readings are both plausible and harmless, satisfy both.
5. CONFLICTS. When the request conflicts with the agent's original instructions (page or item limits, brevity) the request wins: list those constraints under relax, never repeat them in the checklist.
6. KEEP. For specific_items and one_field_everywhere, keep must say that every other part/field stays word for word and in the same order. Never freeze in keep something the change necessarily alters (a harder question needs new options and a new explanation; a shorter text drops sentences).
7. VERIFIABLE. The checklist can be checked by reading the new result.
8. Everything stays based on the reference material — never ask for invented facts.
9. Write "understood" in the language of the user's request and make it name the exact place ("I'll rewrite question 3 to ask about X and leave the other 9 as they are"); brief and checklist in the language of the result. Never mention prompts, JSON or models.`;

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
