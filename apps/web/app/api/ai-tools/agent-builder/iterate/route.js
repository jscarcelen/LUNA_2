import { NextResponse } from "next/server";
import { resolveAgentModel } from "../../../../../modules/ai-tools/pipeline/agentBuilder.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    understood: { type: "string", description: "One sentence, in the user's language, saying what Luna understood the user wants. Shown to the user." },
    brief: { type: "string", description: "The precise instruction for the writer: what to change, where, how much, and how it should look in the result. Concrete, no vagueness." },
    checklist: { type: "array", items: { type: "string" }, description: "3–6 verifiable conditions the new result must satisfy so the change is clearly visible (counts, places, what must appear)." },
    relax: { type: "array", items: { type: "string" }, description: "Constraints of the original instructions that the request overrides (for example: length limits, item counts). Empty if none." },
    keep: { type: "array", items: { type: "string" }, description: "What must stay as it is." }
  },
  required: ["understood", "brief", "checklist", "relax", "keep"]
};

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
    const fallback = { understood: text, brief: text, checklist: [], relax: [], keep: [] };
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
            content: "You are the prompt improver of an education platform. A person generated a study document with an AI agent, read it, and asks for a change in a few words. Turn that request into a precise revision brief. Rules: (1) decide exactly what they mean for THIS result — name the sections, topics or blocks to change and the kind of change; (2) make it concrete and measurable: 'add more examples' becomes how many, of what kind (worked numerical examples, real-world cases), under which concepts; 'focus on X' becomes which parts to expand, shorten or cut; (3) when the request conflicts with the agent's original instructions (page or item limits, brevity) the request wins — list those constraints under relax so the writer may exceed them sensibly, and never restate those constraints in the checklist; (4) the checklist must be verifiable by reading the new result; (5) everything stays based on the reference material — never ask for invented facts; (6) write understood in the language of the user's request, brief and checklist in the language of the result. Never mention prompts, JSON or models."
          },
          {
            role: "user",
            content: JSON.stringify({
              agent: { name: String(body?.agentName || ""), originalInstructions: String(body?.instructions || "").slice(0, 2500) },
              userChoices: Array.isArray(body?.choices) ? body.choices : [],
              currentResult: String(body?.currentResult || "").slice(0, 6000),
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
