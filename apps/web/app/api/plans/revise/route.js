import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    note: { type: "string", description: "Two sentences to the learner: what changed in the plan and why." },
    newGoals: {
      type: "array",
      description: "Goals for the NEW material only (0–3), naming the concepts they cover. Empty when existing goals already cover it.",
      items: {
        type: "object", additionalProperties: false,
        properties: { title: { type: "string" }, concepts: { type: "array", items: { type: "string" } }, targetScore: { type: "number", description: "0–1" } },
        required: ["title", "concepts", "targetScore"]
      }
    },
    items: {
      type: "array",
      description: "The schedule of everything STILL TO DO, in date order: the pending steps worth keeping plus the new steps. Never include steps that are already done.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          keepId: { type: "string", description: "Id of the existing pending step this is (it keeps its built resource). Empty for a new step." },
          title: { type: "string" },
          kind: { type: "string", enum: ["activity", "read", "review", "exam"] },
          dueDate: { type: "string", description: "YYYY-MM-DD, between today and the deadline" },
          minutes: { type: "integer", description: "Realistic working minutes, 15–90." },
          sourceId: { type: "string", description: "Id of the uploaded material or generated resource this step works on, or empty." },
          generate: { type: "string", enum: ["", "quiz", "flashcards", "summary", "exam", "worksheet"], description: "Non-empty when Luna should generate this resource from the material. Empty for steps that use an existing resource." },
          goal: { type: "string", description: "Title of the goal it serves, or empty." },
          concepts: { type: "array", items: { type: "string" } }
        },
        required: ["keepId", "title", "kind", "dueDate", "minutes", "sourceId", "generate", "goal", "concepts"]
      }
    }
  },
  required: ["note", "newGoals", "items"]
};

const list = (items, render) => (items.length ? items.map(render).join("\n") : "(none)");

/**
 * Redoes a study plan when material is added. What is already done is fixed and only reported; the
 * model schedules everything still to do — the pending steps and the new ones — in the time that
 * is left, keeping the learner's pace and leaving the last fifth for review.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const today = String(body?.today || new Date().toISOString().slice(0, 10));
    const deadline = String(body?.deadline || "").trim();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!deadline) return NextResponse.json({ error: "The plan needs a deadline to be re-planned." }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "No model configured." }, { status: 500 });

    const done = Array.isArray(body?.done) ? body.done : [];
    const pending = Array.isArray(body?.pending) ? body.pending : [];
    const fresh = Array.isArray(body?.newUploaded) ? body.newUploaded : [];
    const kinds = Array.isArray(body?.kinds) && body.kinds.length ? body.kinds : ["quiz", "flashcards"];
    const minutesPerWeek = Number(body?.minutesPerWeek) || 120;
    const performance = body?.performance || null;
    const conceptMap = Array.isArray(body?.conceptMap) ? body.conceptMap : [];
    const resourceNames = body?.resourceNames && typeof body.resourceNames === "object" ? body.resourceNames : {};

    const history = performance
      ? `The learner has done ${performance.activities || 0} activities, averaging ${Math.round((performance.average || 0) * 100)}%.${(performance.weakConcepts || []).length ? ` They keep getting these wrong: ${performance.weakConcepts.slice(0, 12).join(", ")}.` : ""}`
      : "There is no performance history yet.";
    const conceptSection = conceptMap.length
      ? `\n\nConcept map (the ONLY allowed concept names for tags, used EXACTLY as written):\n${conceptMap.map((concept) => `- ${concept.name}${concept.topic ? ` (under: ${concept.topic})` : ""}`).join("\n")}`
      : "";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LUNA_PLAN_MODEL || "gpt-4o",
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: "revised_plan", strict: true, schema: SCHEMA } },
        messages: [
          {
            role: "system",
            content: `You are a study planner re-planning an existing plan because new material was added.
Hard rules:
1. Work already DONE is fixed. Never schedule it again and never repeat it; use it only to avoid duplicating content.
2. Schedule everything still to do — the pending steps and the steps for the new material — between ${today} and ${deadline}, at about ${minutesPerWeek} minutes a week and never more than 90 minutes on one day. If the time left cannot hold everything, shorten or drop the least important practice rather than overloading days.
3. Keep each pending step that is still useful: return it with its keepId (you may move its date and change its minutes). Steps that Luna has already built (built=true) must be kept. Planned-but-unbuilt practice (built=false, generate set) may be replaced.
4. For each NEW uploaded document add a reading step (generate "", sourceId = the document id) and practice generated from it, using only these kinds: ${kinds.join(", ")} (generate = the kind, sourceId = the document id). New GENERATED resources are already pending steps: keep them (keepId) and place them in the schedule.
5. Space repetition, give weak concepts more time and earlier practice, and leave the last fifth of the remaining time for review and a practice exam instead of new content.
6. Every step names the concepts it serves.${conceptSection}
Dates are YYYY-MM-DD, between ${today} and ${deadline}.`
          },
          {
            role: "user",
            content: `Today: ${today}\nDeadlines: ${(body?.deadlines || []).map((d) => `${d.title} ${d.date}`).join("; ") || deadline}\n\n${history}\n\nALREADY DONE (fixed):\n${list(done, (item) => `- ${item.title} (${item.kind})${item.concepts?.length ? ` — ${item.concepts.join(", ")}` : ""}`)}\n\nPENDING STEPS (movable):\n${list(pending, (item) => `- [${item.id}] ${item.title} (${item.kind}, ${item.minutes} min, was due ${item.dueDate || "no date"}, built=${item.built}${item.generate ? `, generate=${item.generate}` : ""})${item.concepts?.length ? ` — ${item.concepts.join(", ")}` : ""}`)}\n\nNEW UPLOADED MATERIAL:\n${list(fresh, (item) => `- [${item.id}] ${item.name}${item.concepts?.length ? ` — teaches: ${item.concepts.join(", ")}` : ""}`)}\n\nExisting goals:\n${list(body?.goals || [], (goal) => `- ${goal.title}`)}${Object.keys(resourceNames).length ? `\n\nResource names:\n${Object.entries(resourceNames).map(([id, name]) => `- [${id}] ${name}`).join("\n")}` : ""}`
          }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Model request failed");
    return NextResponse.json({ revision: JSON.parse(payload.choices?.[0]?.message?.content || "{}") });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
