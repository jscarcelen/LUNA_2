import { NextResponse } from "next/server";
import { resolveAgentModel } from "../../../../modules/ai-tools/pipeline/agentBuilder.js";
import { planUpdateSchema } from "../../../../modules/plans/updatePlan.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const list = (items, render) => (items.length ? items.map(render).join("\n") : "(none)");

/**
 * Updates a study plan with the learner's own words ("lighter workload in the last two weeks", "add a mock
 * exam two days before the deadline"). The model proposes the steps still to do; what it may NOT change —
 * finished steps, built resources, deadlines someone else set, agents outside the plan's scope — is enforced
 * by `applyPlanUpdate` on the client, whatever this answers. Luna 3 Pro at least.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const instruction = String(body?.instruction || "").trim();
    const today = String(body?.today || new Date().toISOString().slice(0, 10));
    const horizon = String(body?.horizon || "").trim();
    if (!instruction) return NextResponse.json({ error: "Say what to change in the plan." }, { status: 400 });
    if (!horizon) return NextResponse.json({ error: "The plan needs a deadline to be updated." }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No model configured." }, { status: 500 });

    const steps = Array.isArray(body?.steps) ? body.steps : [];
    const done = steps.filter((step) => step.done);
    const pending = steps.filter((step) => !step.done);
    const deadlines = Array.isArray(body?.deadlines) ? body.deadlines : [];
    // The agents the learner allowed when the plan was made; new practice stays inside that scope.
    const scoped = Array.isArray(body?.agents);
    const agents = scoped ? body.agents.filter((agent) => agent?.id && Array.isArray(agent.makes) && agent.makes.length) : [];
    const kinds = Array.isArray(body?.kinds) ? body.kinds.filter((key) => typeof key === "string" && key) : [];
    const agentSection = scoped && !agents.length
      ? `The learner allowed NO agents: Luna builds nothing, so generate is "" on every step.`
      : agents.length
      ? `Agents Luna may use for NEW steps (the learner's chosen scope, nothing else):\n${agents.map((agent) => `- ${agent.label}: ${agent.purpose || "builds study material"} → generate = ${agent.makes.join(" | ")}`).join("\n")}`
      : "";
    const minutesPerWeek = Number(body?.minutesPerWeek) || 120;
    const performance = body?.performance || null;
    const conceptMap = Array.isArray(body?.conceptMap) ? body.conceptMap : [];
    const history = performance
      ? `The learner has done ${performance.activities || 0} activities, averaging ${Math.round((performance.average || 0) * 100)}%.${(performance.weakConcepts || []).length ? ` They keep getting these wrong: ${performance.weakConcepts.slice(0, 12).join(", ")}.` : ""}`
      : "There is no performance history yet.";
    const conceptList = conceptMap.map((concept) => `- ${concept.name}${concept.topic ? ` (under: ${concept.topic})` : ""}`).join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: resolveAgentModel(process.env.LUNA_PLAN_MODEL),
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: "plan_update", strict: true, schema: planUpdateSchema([...kinds, ...pending.map((step) => step.generate).filter(Boolean)]) } },
        messages: [
          {
            role: "system",
            content: `You are a study planner updating an existing study plan because the learner asked for a change. Apply the learner's request, visibly and only as far as it asks, to the steps still to do, and return them all in the JSON schema you are given.

<rules>
1. The learner's request is the point. Every step it does not touch is returned unchanged with change "kept", because the learner did not ask to rewrite the plan.
2. Steps that are DONE are fixed. They are listed for context only; never return, move or repeat them.
3. Return EVERY step still to do (the pending ones), in date order, each marked kept, moved, edited, added or removed. A step to remove is returned with change "removed" and its id. A step Luna has already built (built=true) cannot be removed, because the learner's resource is attached to it: you may move it or retitle it.
4. Deadlines marked locked=true were set by someone else (a teacher): never ask to change or drop them. Other deadlines move only when the request says so; then give their id and the new date in deadlineChanges, otherwise leave deadlineChanges empty.
5. Every date is YYYY-MM-DD, from ${today} to ${horizon} inclusive. The learner studies about ${minutesPerWeek} minutes a week and at most 90 minutes on any one day, each step 15-90 minutes. If the request changes the time available, follow it: shorten or drop the least important practice rather than overloading days, because an overloaded plan gets abandoned.
6. A NEW step that needs material from Luna sets generate to one of the allowed kinds (${kinds.join(", ") || "none"}) and names the material it works on in sourceId when you know it. Every step names the concepts it serves, using the concept map wording exactly as written when a map is given.
7. Keep the last stretch before the final deadline for review and a practice exam unless the request says otherwise, because that is when practice consolidates. Space repetition; weak concepts get earlier practice.
8. summary: two short sentences in the language of the request, saying what changed and why, naming the steps ("moved the mock exam to 3 March"), in plain words about the plan only (no JSON, prompts or models), because the learner reads it as a message from their planner.
</rules>

Before you answer, check: the request is visibly applied; no done step is returned; every pending step appears exactly once; built steps are not removed; locked deadlines are not changed; every date lies between ${today} and ${horizon}; no day exceeds 90 minutes; every generate value is allowed. Fix what fails, then answer.`
          },
          {
            role: "user",
            content: `<today>${today}</today>\n\n<deadlines>\n${list(deadlines, (d) => `- [${d.id}] ${d.title} ${d.date}${d.locked ? " (locked: set by someone else)" : ""}`)}\n</deadlines>\n\n<learner_history>\n${history}\n</learner_history>\n\n<done_fixed>\n${list(done, (item) => `- ${item.title} (${item.kind})${item.concepts?.length ? ` — ${item.concepts.join(", ")}` : ""}`)}\n</done_fixed>\n\n<pending_steps can_change="true">\n${list(pending, (item) => `- [${item.id}] ${item.title} (${item.kind}, ${item.minutes} min, due ${item.dueDate || "no date"}, built=${item.built}${item.generate ? `, generate=${item.generate}` : ""}${item.goal ? `, goal: ${item.goal}` : ""})${item.concepts?.length ? ` — ${item.concepts.join(", ")}` : ""}`)}\n</pending_steps>\n\n<goals>\n${list(body?.goals || [], (goal) => `- ${goal.title}`)}\n</goals>${agentSection ? `\n\n<agent_scope>\n${agentSection}\n</agent_scope>` : ""}${conceptList ? `\n\n<concept_map>\nThe only allowed concept names:\n${conceptList}\n</concept_map>` : ""}\n\n<request>\n${instruction}\n</request>\n\nUpdate the plan with the request above now.`
          }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Model request failed");
    return NextResponse.json({ update: JSON.parse(payload.choices?.[0]?.message?.content || "{}"), model: payload.model || "", usage: payload.usage || null });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
