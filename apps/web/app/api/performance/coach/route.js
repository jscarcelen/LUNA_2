import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    headline: { type: "string", description: "One sentence naming the single most useful thing to know about this learner right now. Never a compliment, never a scold — a diagnosis." },
    diagnosis: { type: "string", description: "Two or three sentences explaining what the pattern of mistakes says about what is actually going wrong, in plain words." },
    actions: {
      type: "array",
      description: "Exactly five things to do next, most useful first — a mix of fixing the way answers go wrong, the plan steps that are due soonest, the weakest topics and topics that are slipping. Each one must be doable on Luna this week.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string", description: "The action in under 8 words, as an instruction ('Re-read the mitosis notes, then 10 questions')." },
          why: { type: "string", description: "One sentence: which evidence makes this the right next move." },
          topic: { type: "string", description: "The topic it addresses, exactly as given in the evidence, or an empty string." },
          kind: { type: "string", enum: ["practise", "reteach", "review", "spaced-recall", "exam-technique", "habit", "deadline"] },
          effort: { type: "string", enum: ["10 minutes", "30 minutes", "an hour", "a few sessions"] }
        },
        required: ["title", "why", "topic", "kind", "effort"]
      }
    },
    messages: {
      type: "object", additionalProperties: false,
      description: "The same finding said three ways, for the three people who read this screen.",
      properties: {
        student: { type: "string", description: "To the learner, second person, encouraging but specific." },
        parent: { type: "string", description: "To a parent, no jargon, says what to do at home." },
        teacher: { type: "string", description: "To a teacher, names the misconception and the intervention." }
      },
      required: ["student", "parent", "teacher"]
    }
  },
  required: ["headline", "diagnosis", "actions", "messages"]
};

const SYSTEM = `You are a learning coach. You read one learner's evidence (the <evidence> block in the user message: mastery per topic, the kinds of mistake they make, which questions keep going wrong, and the study plan being tracked) and tell them what to do next. The output is a diagnosis, exactly five actions and three short messages. Each action becomes a button in Luna, so it must point at one topic or plan step and be doable on Luna this week.

How to read the evidence:
- Mastery is not accuracy. A high score on easy, recent, thin evidence is not mastery, so say so when that is what the numbers show.
- Diagnose the mistake, not the score, because each kind of mistake needs a different action. The error breakdown tells you which kinds are present. There are exactly three:
  - Topic-knowledge gap: the idea, definition, fact or relationship is not known or is confused. It includes every wrong answer to a question that needs no maths (definitions, "which is NOT…", differences, classification, theory). Action: re-teach the concept and its prerequisite.
  - Analytical gap: the learner went wrong in a mathematical or analytical process (a calculation, applying a formula or procedure, a multi-step derivation, interpreting numbers or data). It can only happen in questions that need maths, so describe a mistake in a question that needs no maths as a topic-knowledge gap. Action: practise the method with worked steps.
  - Accuracy: the answer was close to what was expected but not exact (a slip, a wrong detail, unit, sign, rounding or spelling, an incomplete answer on the right track, a misread question, or a blank on a topic the learner otherwise knows). Action: slow down and check.
- A topic that was strong and has slipped needs recall practice, because the learner already knew it and only needs it brought back.

How to choose the five actions (they must be a mixture, not five versions of the same thing):
1. At least one that fixes the most common kind of mistake, using the advice for that kind.
2. At least one that is the plan step due soonest or already late: kind "deadline", with the step named as the plan names it.
3. At least one for the weakest topic.
4. One to bring back a topic that was strong and is slipping, if there is one.
5. Fill the rest from the evidence.
Order them by what helps most, weighing how close a deadline is.

Wording:
- Pair any practice with a reason or a method (what to practise and why), because "do more questions" on its own does not tell the learner what to change.
- Describe results as a diagnosis; report time spent only as context, because time is not an achievement.
- Copy topic names exactly as the evidence writes them, so Luna can link each action to the right material.
- Use plain words and honest, specific encouragement, because jargon and inflated praise hide what to do.

Before answering, check that there are exactly five actions, that each topic string appears in the evidence (or is empty), and that no mistake in a question without maths is called analytical.`;

/**
 * The coach.
 *
 * Every other part of the performance screen measures; this one reads the measurements and says what
 * to do — and returns it structured, so each recommendation becomes a button on the dashboard that
 * generates the practice, schedules it in a plan or opens the material it points at.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No model configured." }, { status: 500 });

    const learner = String(body?.learner || "the learner").slice(0, 80);
    const role = ["student", "parent", "teacher"].includes(body?.role) ? body.role : "student";
    const topics = Array.isArray(body?.topics) ? body.topics.slice(0, 24) : [];
    const errorTypes = Array.isArray(body?.errorTypes) ? body.errorTypes.slice(0, 8) : [];
    const stuck = Array.isArray(body?.stuck) ? body.stuck.slice(0, 12) : [];
    const plan = body?.plan || null;
    if (!topics.length && !errorTypes.length) return NextResponse.json({ error: "Not enough evidence yet to read." }, { status: 400 });

    const evidence = [
      "<evidence>",
      `Learner: ${learner}. This is read by a ${role}.`,
      plan ? `Study plan being tracked: “${plan.name}”${plan.deadline ? `, next deadline ${plan.deadline}` : ""}${plan.done !== undefined ? `, ${plan.done} of ${plan.total} steps done` : ""}${plan.late ? `, ${plan.late} steps late` : ""}.` : "No study plan is being tracked.",
      ...(Array.isArray(plan?.upcoming) && plan.upcoming.length ? ["Plan steps still to do, soonest first (title · due · kind):", ...plan.upcoming.slice(0, 8).map((step) => `- ${String(step.title).slice(0, 120)} · ${step.dueDate || "no date"} · ${step.kind || ""}`)] : []),
      "",
      "Mastery per topic (mastery% · accuracy% · recent% · questions asked · retention% · trend in points):",
      ...topics.map((topic) => `- ${topic.topic}: ${topic.mastery}% · acc ${Math.round((topic.accuracy || 0) * 100)}% · recent ${Math.round((topic.recentAccuracy || 0) * 100)}% · ${topic.questions} q · retention ${topic.retention === null || topic.retention === undefined ? "n/a" : `${Math.round(topic.retention * 100)}%`} · trend ${Math.round((topic.trend || 0) * 100)}`),
      "",
      "Why answers are wrong, as a share of all mistakes:",
      ...errorTypes.map((type) => `- ${type.label}: ${Math.round((type.share || 0) * 100)}% (${type.count})`),
      "",
      "Questions that keep going wrong:",
      ...stuck.map((row) => `- ${row.prompt} → correct answer: ${row.expected}${row.topic ? ` (${row.topic})` : ""}${row.times ? ` · wrong ${row.times}×` : ""}`),
      "</evidence>",
      "",
      "Read the evidence above and return the diagnosis, the five actions and the three messages."
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LUNA_COACH_MODEL || "gpt-4o",
        temperature: 0.3,
        response_format: { type: "json_schema", json_schema: { name: "performance_coach", strict: true, schema: SCHEMA } },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: evidence }]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Model request failed");
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    return NextResponse.json({
      headline: parsed.headline || "",
      diagnosis: parsed.diagnosis || "",
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5) : [],
      messages: parsed.messages || { student: "", parent: "", teacher: "" },
      readAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Could not read the results." }, { status: 500 });
  }
}
