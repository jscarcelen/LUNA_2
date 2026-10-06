import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** The schema with `generate` limited to the plan's agent scope (plus anything already planned). */
function schemaFor(keys) {
  const schema = JSON.parse(JSON.stringify(SCHEMA));
  schema.properties.items.items.properties.generate.enum = ["", ...keys];
  return schema;
}

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
    // The agents the learner allowed when the plan was made; new practice stays inside that scope.
    const scoped = Array.isArray(body?.agents);
    const agents = scoped ? body.agents.filter((agent) => agent?.id && Array.isArray(agent.makes) && agent.makes.length) : [];
    const kinds = scoped ? [...new Set(agents.flatMap((agent) => agent.makes))] : (Array.isArray(body?.kinds) && body.kinds.length ? body.kinds : ["quiz", "flashcards"]);
    const schemaKeys = [...new Set([...kinds, ...pending.map((item) => item.generate).filter(Boolean)])];
    const agentSection = scoped && !agents.length
      ? `The learner allowed NO agents: Luna builds nothing, so generate is "" on every step and the plan schedules studying the material itself.`
      : agents.length
      ? `Agents Luna may use (the learner's chosen scope; use only what is needed, and nothing outside this list):\n${agents.map((agent) => `- ${agent.label}: ${agent.purpose || "builds study material"} → generate = ${agent.makes.join(" | ")}`).join("\n")}`
      : "";
    const minutesPerWeek = Number(body?.minutesPerWeek) || 120;
    const performance = body?.performance || null;
    const conceptMap = Array.isArray(body?.conceptMap) ? body.conceptMap : [];
    const resourceNames = body?.resourceNames && typeof body.resourceNames === "object" ? body.resourceNames : {};

    const history = performance
      ? `The learner has done ${performance.activities || 0} activities, averaging ${Math.round((performance.average || 0) * 100)}%.${(performance.weakConcepts || []).length ? ` They keep getting these wrong: ${performance.weakConcepts.slice(0, 12).join(", ")}.` : ""}`
      : "There is no performance history yet.";
    const conceptList = conceptMap.map((concept) => `- ${concept.name}${concept.topic ? ` (under: ${concept.topic})` : ""}`).join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LUNA_PLAN_MODEL || "gpt-4o",
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: "revised_plan", strict: true, schema: schemaFor(schemaKeys) } },
        messages: [
          {
            role: "system",
            content: `You are a study planner re-planning an existing plan because new material was added. Schedule everything still to do, the pending steps and the steps for the new material, between ${today} and ${deadline}, without touching work that is already done. Return the JSON schema you are given: "newGoals" first, then "items" in date order, then the "note".

<rules>
1. Done work is fixed. Never schedule or repeat it; use it only to avoid duplicating content, because the learner already spent that time.
2. Window and pace: every dueDate is YYYY-MM-DD from ${today} to ${deadline} inclusive, at about ${minutesPerWeek} minutes a week and at most 90 minutes on any one day, each step 15-90 minutes. If the time left cannot hold everything, shorten or drop the least important practice rather than overloading days, because an overloaded plan gets abandoned.
3. Keep every pending step that is still useful: return it with its keepId (you may move its date and change its minutes). Steps Luna has already built (built=true) are always kept, because the learner's resource is attached to them. Planned-but-unbuilt practice (built=false, generate set) may be replaced.
4. For each NEW uploaded document add a reading step (generate "", sourceId = the document id) and practice generated from it, using only these kinds: ${kinds.join(", ") || "none"} (generate = the kind, sourceId = the document id). New GENERATED resources already appear as pending steps: keep them (keepId) and place them in the schedule. New steps have an empty keepId.
5. Exhaustive coverage: every concept of the concept map stays studied AND tested by a generated activity somewhere in the final schedule (done steps count). Each activity is generated from the concepts listed on its step with at least one question per concept, so list them; a step lists at most 8 concepts and the final exam lists them all.
6. Spaced repetition: a topic comes back a few days later as a short check. Weak concepts get more time and earlier practice. The last fifth of the remaining time holds review and a practice exam, not new content, because the learner needs it to consolidate.
7. Every step names the concepts it serves, using the concept map wording exactly as written, because the app matches them by name. Write titles, goals and the note in the language of the material.
8. newGoals: 0-3 goals for the NEW material only, each naming the concepts it covers and a targetScore between 0 and 1; none when an existing goal already covers it. The note is two sentences to the learner: what changed in the plan and why.
</rules>

Before you answer, check: no done step appears in items; every built=true step is present with its keepId; every dueDate lies between ${today} and ${deadline}; no day exceeds 90 minutes; every concept of the map is studied and tested; every generate value is one of the allowed kinds. Fix what fails, then answer.`
          },
          {
            role: "user",
            content: `<today>${today}</today>\n<deadlines>${(body?.deadlines || []).map((d) => `${d.title} ${d.date}`).join("; ") || deadline}</deadlines>\n\n<learner_history>\n${history}\n</learner_history>\n\n<done_fixed>\n${list(done, (item) => `- ${item.title} (${item.kind})${item.concepts?.length ? ` — ${item.concepts.join(", ")}` : ""}`)}\n</done_fixed>\n\n<pending_steps movable="true">\n${list(pending, (item) => `- [${item.id}] ${item.title} (${item.kind}, ${item.minutes} min, was due ${item.dueDate || "no date"}, built=${item.built}${item.generate ? `, generate=${item.generate}` : ""})${item.concepts?.length ? ` — ${item.concepts.join(", ")}` : ""}`)}\n</pending_steps>\n\n<new_uploaded_material>\n${list(fresh, (item) => `- [${item.id}] ${item.name}${item.concepts?.length ? ` — teaches: ${item.concepts.join(", ")}` : ""}`)}\n</new_uploaded_material>\n\n<existing_goals>\n${list(body?.goals || [], (goal) => `- ${goal.title}`)}\n</existing_goals>${Object.keys(resourceNames).length ? `\n\n<resource_names>\n${Object.entries(resourceNames).map(([id, name]) => `- [${id}] ${name}`).join("\n")}\n</resource_names>` : ""}${agentSection ? `\n\n<agent_scope>\n${agentSection}\n</agent_scope>` : ""}${conceptList ? `\n\n<concept_map>\nThe only allowed concept names:\n${conceptList}\n</concept_map>` : ""}\n\nRe-plan everything still to do between ${today} and ${deadline} now.`
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
