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
      description: "Two to five things to do next, most useful first. Each one must be doable on Luna this week.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string", description: "The action in under 8 words, as an instruction ('Re-read the mitosis notes, then 10 questions')." },
          why: { type: "string", description: "One sentence: which evidence makes this the right next move." },
          topic: { type: "string", description: "The topic it addresses, exactly as given in the evidence, or an empty string." },
          kind: { type: "string", enum: ["practise", "reteach", "review", "spaced-recall", "exam-technique", "habit"] },
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

const SYSTEM = `You read a learner's evidence — mastery per topic, the kinds of mistake they make, which questions keep going wrong — and say what to do about it.

Rules:
- Mastery is not accuracy. A high score on easy, recent, thin evidence is not mastery; say so when that is what the numbers show.
- Diagnose the mistake, not the score. Careless arithmetic, a missing prerequisite, a misread question and a genuine knowledge gap need different actions; the error breakdown tells you which.
- A topic that was strong and has slipped needs recall practice, not reteaching.
- Never recommend "do more questions" on its own, and never mention how much time was spent as if it were an achievement.
- Name topics exactly as the evidence names them, so Luna can link each action to the right material.
- No jargon, no praise inflation, no more than five actions.`;

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
      `Learner: ${learner}. This is read by a ${role}.`,
      plan ? `Study plan being tracked: “${plan.name}”${plan.deadline ? `, next deadline ${plan.deadline}` : ""}${plan.done !== undefined ? `, ${plan.done} of ${plan.total} steps done` : ""}${plan.late ? `, ${plan.late} steps late` : ""}.` : "No study plan is being tracked.",
      "",
      "Mastery per topic (mastery% · accuracy% · recent% · questions asked · retention% · trend in points):",
      ...topics.map((topic) => `- ${topic.topic}: ${topic.mastery}% · acc ${Math.round((topic.accuracy || 0) * 100)}% · recent ${Math.round((topic.recentAccuracy || 0) * 100)}% · ${topic.questions} q · retention ${topic.retention === null || topic.retention === undefined ? "n/a" : `${Math.round(topic.retention * 100)}%`} · trend ${Math.round((topic.trend || 0) * 100)}`),
      "",
      "Why answers are wrong, as a share of all mistakes:",
      ...errorTypes.map((type) => `- ${type.label}: ${Math.round((type.share || 0) * 100)}% (${type.count})`),
      "",
      "Questions that keep going wrong:",
      ...stuck.map((row) => `- ${row.prompt} → correct answer: ${row.expected}${row.topic ? ` (${row.topic})` : ""}${row.times ? ` · wrong ${row.times}×` : ""}`)
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LUNA_COACH_MODEL || "gpt-4o-mini",
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
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      messages: parsed.messages || { student: "", parent: "", teacher: "" },
      readAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Could not read the results." }, { status: 500 });
  }
}
