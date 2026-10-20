import { NextResponse } from "next/server";
import { conceptNames, coverageOf, ensureCoverage } from "../../../../modules/plans/coverage.js";
import { capDailyMinutes, normaliseMaxPerDay } from "../../../../modules/plans/dailyCap.js";
import { ensureAgentUse } from "../../../../modules/plans/agentUse.js";
import { CONSOLIDATED_KEY, ensureConsolidatedStep, needsConsolidatedView } from "../../../../modules/plans/master.js";
import { localPlan } from "../../../../modules/plans/localPlan.js";
import { denyAnonymousAi } from "../../../../lib/aiAccess.js";

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
  const blocked = await denyAnonymousAi(request);
  if (blocked) return blocked;
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
      ? `The learner allowed NO agents: Luna builds nothing, so generate is "" on every step and the plan schedules studying the material itself.`
      : agents.length
      ? `Agents Luna may use to build resources (the learner chose each of these on purpose: use EVERY one of them at least once in the plan, each where it helps most, and nothing outside this list):\n${agents.map((agent) => `- ${agent.label}: ${agent.purpose || "builds study material"} → generate = ${agent.makes.join(" | ")}`).join("\n")}`
      : "";
    const minutesPerWeek = Number(body?.minutesPerWeek) || 120;
    // The most the learner studies in one day: a number they chose, checked again in code after the model answers.
    const maxPerDay = normaliseMaxPerDay(body?.maxMinutesPerDay);
    const stepMax = Math.min(90, maxPerDay);
    // The learner's own words (optional): what they prefer and what each exam covers; the shape of what to build.
    const instructions = String(body?.instructions || "").trim().slice(0, 2000);
    const formatNotes = String(body?.formatNotes || "").trim().slice(0, 1500);
    const performance = body?.performance || null;
    if (!deadline) return NextResponse.json({ error: "A deadline is needed." }, { status: 400 });
    if (!materials.length) return NextResponse.json({ error: "Choose at least one document." }, { status: 400 });
    // Many documents, or a lot of material: the first step is one consolidated view of all of it (master.js).
    const uploaded = materials.filter((item) => (item.kind || "material") === "material");
    const consolidated = needsConsolidatedView({ uploadedCount: uploaded.length, totalChars: uploaded.reduce((sum, item) => sum + Math.max(0, Number(item.chars) || 0), 0) });
    const consolidatedTitle = String(body?.consolidatedTitle || "").trim().slice(0, 120) || "Consolidated view of the resources";
    const allowedKinds = consolidated ? [...new Set([...kinds, CONSOLIDATED_KEY])] : kinds;
    const apiKey = process.env.OPENAI_API_KEY;

    const weak = (performance?.weakConcepts || []).slice(0, 12);
    const strong = (performance?.strongConcepts || []).slice(0, 8);
    const history = performance
      ? `The learner has done ${performance.activities || 0} activities, averaging ${Math.round((performance.average || 0) * 100)}%${performance.minutesPerQuestion ? `, about ${performance.minutesPerQuestion} minutes per question` : ""}.${weak.length ? ` They keep getting these wrong: ${weak.join(", ")}.` : ""}${strong.length ? ` They are solid on: ${strong.join(", ")}.` : ""}`
      : "There is no performance history yet, so assume an average pace and check understanding early.";

    // Concept map: canonical set of concepts the plan may reference as tags.
    // Every concept map node must appear in at least one activity's concepts array.
    const conceptMap = Array.isArray(body?.conceptMap) ? body.conceptMap : [];
    const conceptMapList = conceptMap.map((c) => `- ${c.name}${c.topic ? ` (under: ${c.topic})` : ""}`).join("\n");
    const coverageRules = conceptMap.length
      ? `

<coverage_rules>
Exhaustive coverage is the most important rule of this plan, because the learner must be tested on everything in the material. The ${conceptMap.length} concepts are listed in <concept_map> in the user message; they are the only allowed concept names.
1. Every one of the ${conceptMap.length} concepts is STUDIED in a step and TESTED by at least one generated activity (quiz, exam, worksheet or flashcards). A concept that is only read is not covered.
2. Each activity is generated from the concepts listed on its step, with at least one question per listed concept, so list them: a concept left out of every activity's "concepts" gets no question at all.
3. A step lists at most 8 concepts. Group related concepts together and use more steps rather than overloading one, because a step with more cannot be finished in 90 minutes.
4. The final practice exam lists ALL ${conceptMap.length} concepts.
5. Weak concepts are tested in at least two separate steps, spaced apart, because one correct answer does not show they are fixed.
6. Fill the "coverage" ledger before you finalise "items": one entry per concept, with the title of the step that studies it and of the activity step that tests it. If you cannot name a testing step for a concept, add a step.
7. Write concept names exactly as listed, with no paraphrasing, synonyms or concepts outside the map, because the app matches them by name.
</coverage_rules>`
      : "";

    // No model: a plain schedule built by code (localPlan.js), checked below exactly like a model's plan.
    let parsed;
    if (!apiKey) {
      parsed = localPlan({ today, deadline, materials, kinds, conceptMap, maxPerDay });
    } else {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        store: false, // never keep user content at the provider (docs/LEGAL_COMPLIANCE_PLAN.md L4)
        model: process.env.LUNA_PLAN_MODEL || "gpt-4o",
        temperature: 0.3,
        response_format: { type: "json_schema", json_schema: { name: "study_plan", strict: true, schema: schemaFor(allowedKinds) } },
        messages: [
          {
            role: "system",
            content: `You are a study planner. Build a dated schedule the learner can actually keep, from the material, deadline and learner history in the user message. Return the JSON schema you are given; fill "goals" and "coverage" (the ledger) before "items".

<rules>
1. Dates: every dueDate is YYYY-MM-DD, from ${today} to ${deadline} inclusive. A step outside that window cannot be done before the exam.
2. Workload: about ${minutesPerWeek} minutes a week in total, and the minutes of ALL the steps due on one day add up to at most ${maxPerDay} (add them up for every day before you answer), each step 15-${stepMax} minutes. A plan that overloads a day gets abandoned, so use more days rather than longer days.
3. Review window: the last fifth of the time before ${deadline} holds review and a practice exam only, never new content, because the learner needs those days to consolidate. The practice exam is the last step.
4. Spaced repetition: a topic studied once comes back a few days later as a short check of 15-30 minutes, because recalling after a gap fixes it in memory better than rereading.
5. Weak concepts get more minutes and earlier practice than strong ones, because that is where the score is gained. With no history, assume an average pace and check understanding early.
6. Complete coverage: every part of the material gets practice, so that no part is only read.
7. Generated resources: set generate only to one of these kinds: ${kinds.join(", ") || "none"}; use "" for steps that read or review existing material, because Luna can build only those kinds. When generate is set, sourceId is the id of the material it is built from.
8. Concept tags: each goal and step names the concepts it serves, using the wording given with the material, so the plan links back to it.
9. Language: write the name, note, goal titles and step titles in the language of the material, because the learner reads them as written.
10. Learner instructions: when <learner_instructions> is given, it says which kinds of activity the learner prefers and what material each exam or deadline covers. Follow it when choosing, ordering and sizing the steps, because the plan has to fit this learner; it never overrides rules 1-3 (dates, workload, review window).
11. Summaries first: when "summary" is an allowed generate kind, open each group of related topics with a step "Summary: <topics>" (generate = summary, kind read, 20-30 minutes, naming those topics in concepts) and put the "Read: <topics>" step of the original notes right after it, on the same or the next day, because a 1-2 page summary of the key ideas, messages and formulas sets the scene before the learner reads the real notes. Every summary is read before its notes.
12. Every agent in <agent_scope> is used at least once, because the learner chose each of them deliberately: a level test at the start, summaries, formula sheets and reading parts before the notes, flashcards and problem sets spread through the middle, quizzes and the practice exam after the topics they test.
13. Reading parts: when "reading" is an allowed generate kind, never schedule "read the whole document". Every step that reads an uploaded document is its own part: generate = reading, sourceId = that document, a title "Read: <what this part covers>" and the 1-8 concepts of that part in concepts, with different parts on different days, because the learner works through the material piece by piece.
14. Consolidated view first: when <consolidated_view> is in the user message, the FIRST step of the plan is reading the consolidated view: the title given there, kind read, generate = master, sourceId empty, 30-45 minutes, dueDate ${today}, concepts = the main topics. Luna writes it before anything else as one document that brings all the material together by topic, so every later step builds on it: summaries, reading parts and activities come after it. Use generate = master for this step only.
</rules>

<step_format>
A well-formed step has a title that says what to do and on what, starting with a verb or its type ("Read: osmosis and diffusion", "Quiz: the cell membrane"); one kind (read, activity, review or exam) that matches the title; a realistic number of minutes; a sourceId taken from the material list (empty only when no single document applies); the exact title of the goal it serves; and its concepts. The plan has 2-6 goals, each naming the concepts it covers and a targetScore between 0 and 1 (the share of questions the learner should get right). The note is two sentences to the learner: what the plan does and why it is spread this way.
</step_format>${coverageRules}

Before you answer, check the schedule against the rules:${consolidated ? " the first step is the consolidated view (generate = master) and no other step uses master;" : ""} every dueDate lies between ${today} and ${deadline}; no day adds up to more than ${maxPerDay} minutes; the last fifth holds no new content; every generate value is allowed; every step's concepts come from the material and its goal is one of your goals${conceptMap.length ? "; the coverage ledger has one entry per concept and each tested concept has a real activity step" : ""}. Fix what fails, then answer.`
          },
          {
            role: "user",
            content: `<today>${today}</today>\n<deadline>${deadline}</deadline>\n\n<learner_history>\n${history}\n</learner_history>\n\n<material>\n${materials.map((item) => `- [${item.id}] ${item.name}${item.kind ? ` (${item.kind})` : ""}${item.concepts?.length ? ` — teaches: ${item.concepts.join(", ")}` : ""}`).join("\n")}\n</material>${agentSection ? `\n\n<agent_scope>\n${agentSection}\n</agent_scope>` : ""}${instructions ? `\n\n<learner_instructions>\n${instructions}\n</learner_instructions>` : ""}${formatNotes ? `\n\n<resource_formats>\nThe learner's wishes for the shape of the exams, worksheets and flashcards that will be built (they are applied when the material is generated; use them to choose kinds and sizes):\n${formatNotes}\n</resource_formats>` : ""}${conceptMapList ? `\n\n<concept_map>\n${conceptMapList}\n</concept_map>` : ""}${consolidated ? `\n\n<consolidated_view>\nTitle of the first step: ${consolidatedTitle}\nThe plan has ${uploaded.length} uploaded document${uploaded.length === 1 ? "" : "s"}${uploaded.length >= 3 ? "" : " with a lot of material"}; Luna merges them into one document organised by topic, with overlaps written once and the sources of every section.\n</consolidated_view>` : ""}\n\nBuild the study plan from ${today} to ${deadline} now.`
          }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Model request failed");
    parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    }

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
    // The learner chose these agents on purpose: any the model left out gets a step, and reading parts replace "read the whole file".
    let agentUse = null;
    if (Array.isArray(parsed.items) && agents.length) {
      const used = ensureAgentUse(parsed.items, agents, { today, deadline, materials, concepts: names });
      parsed.items = used.items;
      agentUse = { added: used.added, converted: used.converted };
    }
    // Whatever the model added up, no day may exceed the budget the learner set.
    let dailyCap = null;
    if (Array.isArray(parsed.items)) {
      const capped = capDailyMinutes(parsed.items, { maxPerDay, today, horizon: deadline });
      parsed.items = capped.items;
      dailyCap = { maxPerDay, moved: capped.moved, clamped: capped.clamped, overloadedDays: capped.overloadedDays };
    }
    // The consolidated view is the first step, exactly once, on the plan's first day (checked after the daily cap moved steps).
    let consolidatedView = null;
    if (Array.isArray(parsed.items)) {
      if (consolidated) {
        const first = ensureConsolidatedStep(parsed.items, { today, title: consolidatedTitle, concepts: names });
        parsed.items = first.items;
        consolidatedView = { added: first.added, title: parsed.items[0]?.title || consolidatedTitle };
      } else {
        // Not needed: a step the model asked for anyway reads the material instead.
        parsed.items = parsed.items.map((item) => (item.generate === CONSOLIDATED_KEY ? { ...item, generate: "" } : item));
      }
    }
    return NextResponse.json({ plan: parsed, coverage, dailyCap, agentUse, consolidatedView, local: !apiKey });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
