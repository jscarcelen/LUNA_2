import { NextResponse } from "next/server";
import { conceptNames, coverageOf, ensureCoverage } from "../../../../modules/plans/coverage.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string" },
    note: { type: "string", description: "Two sentences to the learner: what this plan does and why it is spread this way." },
    goals: {
      type: "array",
      description: "What has to be achieved, 2–6, each naming the concepts it covers.",
      items: {
        type: "object", additionalProperties: false,
        properties: { title: { type: "string" }, concepts: { type: "array", items: { type: "string" } }, targetScore: { type: "number", description: "0–1" } },
        required: ["title", "concepts", "targetScore"]
      }
    },
    coverage: {
      type: "array",
      description: "The coverage ledger, written BEFORE the schedule is final: one entry for EVERY concept of the concept map, naming the step where it is first studied and the activity step that tests it.",
      items: {
        type: "object", additionalProperties: false,
        properties: { concept: { type: "string" }, studiedIn: { type: "string", description: "Title of the step where it is studied." }, testedIn: { type: "string", description: "Title of the generated activity step that tests it with at least one question." } },
        required: ["concept", "studiedIn", "testedIn"]
      }
    },
    items: {
      type: "array",
      description: "The schedule, in date order. Each step either studies existing material or asks Luna to generate a resource.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string" },
          kind: { type: "string", enum: ["activity", "read", "review", "exam"] },
          dueDate: { type: "string", description: "YYYY-MM-DD" },
          minutes: { type: "integer", description: "Realistic working minutes, 15–90." },
          sourceId: { type: "string", description: "Id of the material or resource this step works on, or empty." },
          generate: { type: "string", enum: ["", "quiz", "flashcards", "summary", "exam", "worksheet"], description: "Non-empty when Luna should generate this resource from the material before the step." },
          goal: { type: "string", description: "Title of the goal it serves, or empty." },
          concepts: { type: "array", items: { type: "string" } }
        },
        required: ["title", "kind", "dueDate", "minutes", "sourceId", "generate", "goal", "concepts"]
      }
    }
  },
  required: ["name", "note", "goals", "coverage", "items"]
};

/** The schema with `generate` limited to what the learner's agent scope can make. */
function schemaFor(keys) {
  const schema = JSON.parse(JSON.stringify(SCHEMA));
  schema.properties.items.items.properties.generate.enum = ["", ...keys];
  return schema;
}

/**
 * Builds a study plan from material and a deadline.
 *
 * The schedule is the point: spread the work between today and the deadline, revisit what the
 * learner gets wrong, and leave the last days for review rather than new content. Performance is
 * part of the input — weak concepts and the learner's recent scores steer how much time each topic
 * gets, so the plan a struggling learner receives is not the plan a confident one receives.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const deadline = String(body?.deadline || "").trim();
    const today = new Date().toISOString().slice(0, 10);
    const materials = Array.isArray(body?.materials) ? body.materials.slice(0, 40) : [];
    // The agents the learner allowed (a scope, not a checklist). Older callers send plain kinds.
    const scoped = Array.isArray(body?.agents);
    const agents = scoped ? body.agents.filter((agent) => agent?.id && Array.isArray(agent.makes) && agent.makes.length) : [];
    const kinds = scoped ? [...new Set(agents.flatMap((agent) => agent.makes))] : (Array.isArray(body?.kinds) && body.kinds.length ? body.kinds : ["quiz", "flashcards"]);
    const agentSection = scoped && !agents.length
      ? `\n\nThe learner allowed NO agents: do not ask Luna to generate any resource (generate must be empty on every step); schedule studying the material itself.`
      : agents.length
      ? `\n\nAgents Luna may use to build resources (the learner chose this scope; use only what the plan needs — you do not have to use all of them, and never anything else):\n${agents.map((agent) => `- ${agent.label}: ${agent.purpose || "builds study material"} → generate = ${agent.makes.join(" | ")}`).join("\n")}`
      : "";
    const minutesPerWeek = Number(body?.minutesPerWeek) || 120;
    const performance = body?.performance || null;
    if (!deadline) return NextResponse.json({ error: "A deadline is needed." }, { status: 400 });
    if (!materials.length) return NextResponse.json({ error: "Choose at least one document." }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No model configured." }, { status: 500 });

    const weak = (performance?.weakConcepts || []).slice(0, 12);
    const strong = (performance?.strongConcepts || []).slice(0, 8);
    const history = performance
      ? `The learner has done ${performance.activities || 0} activities, averaging ${Math.round((performance.average || 0) * 100)}%${performance.minutesPerQuestion ? `, about ${performance.minutesPerQuestion} minutes per question` : ""}.${weak.length ? ` They keep getting these wrong: ${weak.join(", ")}.` : ""}${strong.length ? ` They are solid on: ${strong.join(", ")}.` : ""}`
      : "There is no performance history yet, so assume an average pace and check understanding early.";

    // Concept map: canonical set of concepts the plan may reference as tags.
    // Every concept map node must appear in at least one activity's concepts array.
    const conceptMap = Array.isArray(body?.conceptMap) ? body.conceptMap : [];
    const conceptMapSection = conceptMap.length
      ? `\n\nConcept map (CANONICAL — the ONLY allowed concept names, used EXACTLY as written):\n${conceptMap.map((c) => `- ${c.name}${c.topic ? ` (under: ${c.topic})` : ""}`).join("\n")}\n\nEXHAUSTIVE COVERAGE — the most important rule of this plan. The learner must be tested on EVERYTHING in the material, so:\n1. Every one of the ${conceptMap.length} concepts above must be STUDIED in a step and TESTED by at least one generated activity (quiz, exam, worksheet or flashcards). A concept that is only read is NOT covered.\n2. Each activity is generated from the concepts you list on its step, with at least one question per listed concept. A concept you leave out of every activity's "concepts" list gets no question at all.\n3. Keep each step to at most 8 concepts: group related concepts together and use more steps rather than overloading one.\n4. The final practice exam lists ALL ${conceptMap.length} concepts.\n5. Weak concepts are tested in at least two separate steps, spaced apart.\n6. Before you finish, fill the "coverage" ledger: one entry per concept, with the step that studies it and the activity step that tests it. If you cannot name a testing step for a concept, add a step.\n7. Use names EXACTLY as listed — no paraphrasing, no synonyms, no concepts that are not in the map.`
      : "";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LUNA_PLAN_MODEL || "gpt-4o",
        temperature: 0.3,
        response_format: { type: "json_schema", json_schema: { name: "study_plan", strict: true, schema: schemaFor(kinds) } },
        messages: [
          {
            role: "system",
            content: `You are a study planner. Turn material and a deadline into a schedule that a person can actually keep.
Rules: spread the work from ${today} to ${deadline} at about ${minutesPerWeek} minutes a week, never more than 90 minutes on one day, and leave the last fifth of the time for review and a practice exam rather than new content. Space repetition: a topic studied once comes back a few days later as a short check. Weak concepts get more time and earlier practice than strong ones. Cover EVERYTHING: no part of the material may be left without practice. Only use these resource kinds when asking Luna to generate something: ${kinds.join(", ")}. Every step names the concepts it serves, using the concept wording given with the material so the plan links back to it. Dates are YYYY-MM-DD, between ${today} and ${deadline}.${agentSection}${conceptMapSection}`
          },
          {
            role: "user",
            content: `Deadline: ${deadline}\n\n${history}\n\nMaterial available:\n${materials.map((item) => `- [${item.id}] ${item.name}${item.kind ? ` (${item.kind})` : ""}${item.concepts?.length ? ` — teaches: ${item.concepts.join(", ")}` : ""}`).join("\n")}`
          }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Model request failed");
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");

    // Trust but verify: whatever the model's ledger says, check the schedule itself and fill any gap.
    const names = conceptNames(conceptMap);
    let coverage = null;
    if (names.length && Array.isArray(parsed.items)) {
      const before = coverageOf(parsed.items, names);
      const repaired = ensureCoverage(parsed.items, names);
      parsed.items = repaired.items;
      const after = coverageOf(parsed.items, names);
      coverage = { total: names.length, tested: after.tested.length, studied: after.studied.length, repairs: repaired.repairs.filter((entry) => entry.as !== "exam"), plannedGaps: { study: before.missingStudy.length, test: before.missingTest.length } };
    }
    delete parsed.coverage;
    return NextResponse.json({ plan: parsed, coverage });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
